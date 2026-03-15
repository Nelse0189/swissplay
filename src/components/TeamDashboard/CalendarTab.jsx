import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { rrulestr } from 'rrule';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import CalendarEventForm from './CalendarEventForm';
import { useToast } from '../../context/ToastContext';
import './CalendarTab.css';

const locales = { 'en-US': undefined };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales
});

const EVENT_TYPE_EMOJI = {
  scrim: '⚔️',
  practice: '🎯',
  tournament: '🏆',
  meetup: '👋',
  custom: '📌'
};

/** Expand recurring events into instances for calendar display */
function expandRecurringEvents(events, viewStart, viewEnd) {
  const expanded = [];
  for (const ev of events) {
    const startDate = ev.startTime?.toDate ? ev.startTime.toDate() : new Date(ev.startTime);
    const endDate = ev.endTime?.toDate ? ev.endTime.toDate() : new Date(ev.endTime);
    const durationMs = endDate - startDate;

    if (ev.recurrenceRule) {
      try {
        const rrule = rrulestr(ev.recurrenceRule.startsWith('RRULE:') ? ev.recurrenceRule : `RRULE:${ev.recurrenceRule}`);
        const occurrences = rrule.between(viewStart, viewEnd, true);
        occurrences.forEach((occurrence) => {
          const occDate = occurrence instanceof Date ? occurrence : new Date(occurrence);
          const end = new Date(occDate.getTime() + durationMs);
          expanded.push({
            ...ev,
            id: ev.id,
            start: occDate,
            end,
            resource: ev
          });
        });
      } catch (_) {
        expanded.push({ ...ev, start: startDate, end: endDate, resource: ev });
      }
    } else {
      expanded.push({
        ...ev,
        start: startDate,
        end: endDate,
        resource: ev
      });
    }
  }
  return expanded;
}

const CalendarTab = ({ team, canEditSettings }) => {
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState('month');

  const loadEvents = useCallback(async () => {
    if (!team?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, 'calendarEvents'),
        where('teamId', '==', team.id)
      );
      const snapshot = await getDocs(q);
      const evs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      evs.sort((a, b) => {
        const aT = a.startTime?.toMillis?.() ?? a.startTime?.toDate?.()?.getTime() ?? 0;
        const bT = b.startTime?.toMillis?.() ?? b.startTime?.toDate?.()?.getTime() ?? 0;
        return aT - bT;
      });
      setEvents(evs);
    } catch (error) {
      console.error('Error loading calendar events:', error?.code || error?.message || error);
      toast.error(`Failed to load calendar events${error?.message ? `: ${error.message}` : ''}`);
    } finally {
      setLoading(false);
    }
  }, [team?.id, toast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleCreate = async (eventData) => {
    try {
      const data = {
        ...eventData,
        teamId: team.id,
        discordGuildId: team.discordGuildId || null,
        createdBy: auth.currentUser?.uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        remindersSent: {}
      };
      await addDoc(collection(db, 'calendarEvents'), data);
      toast.success('Event created');
      setShowForm(false);
      setEditingEvent(null);
      setSelectedSlot(null);
      loadEvents();
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Failed to create event');
    }
  };

  const handleUpdate = async (eventId, eventData) => {
    try {
      const data = {
        ...eventData,
        updatedAt: Timestamp.now()
      };
      await updateDoc(doc(db, 'calendarEvents', eventId), data);
      toast.success('Event updated');
      setShowForm(false);
      setEditingEvent(null);
      setSelectedSlot(null);
      loadEvents();
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteDoc(doc(db, 'calendarEvents', eventId));
      toast.success('Event deleted');
      setShowForm(false);
      setEditingEvent(null);
      loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
    }
  };

  const handleSelectSlot = ({ start, end }) => {
    if (!canEditSettings) return;
    setSelectedSlot({ start, end });
    setEditingEvent(null);
    setShowForm(true);
  };

  const handleSelectEvent = (calEvent) => {
    if (!canEditSettings) return;
    const ev = calEvent.resource || calEvent;
    setEditingEvent(ev);
    setSelectedSlot(null);
    setShowForm(true);
  };

  const calendarEvents = expandRecurringEvents(
    events,
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  );

  const eventStyleGetter = (event) => {
    const emoji = event.resource?.colorEmoji || EVENT_TYPE_EMOJI[event.resource?.eventType] || '📌';
    return {
      className: 'calendar-event',
      style: {}
    };
  };

  return (
    <div className="calendar-tab">
      <div className="calendar-header">
        <h3>TEAM CALENDAR</h3>
        {canEditSettings && (
          <button className="add-event-btn" onClick={() => { setSelectedSlot(null); setEditingEvent(null); setShowForm(true); }}>
            + ADD EVENT
          </button>
        )}
      </div>

      {loading ? (
        <div className="calendar-loading">Loading calendar...</div>
      ) : (
        <div className="calendar-wrapper">
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            titleAccessor={(e) => {
              const emoji = e.resource?.colorEmoji || EVENT_TYPE_EMOJI[e.resource?.eventType] || '📌';
              return `${emoji} ${e.resource?.title || e.title || 'Event'}`;
            }}
            style={{ height: '100%' }}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            onNavigate={(newDate) => setDate(newDate)}
            onView={(newView) => setView(newView)}
            date={date}
            view={view}
            selectable={canEditSettings}
            eventPropGetter={eventStyleGetter}
            views={['month', 'week']}
          />
        </div>
      )}

      {showForm && (
        <CalendarEventForm
          team={team}
          event={editingEvent}
          initialSlot={selectedSlot}
          onSave={editingEvent ? (data) => handleUpdate(editingEvent.id, data) : handleCreate}
          onDelete={editingEvent ? () => handleDelete(editingEvent.id) : null}
          onClose={() => { setShowForm(false); setEditingEvent(null); setSelectedSlot(null); }}
        />
      )}
    </div>
  );
};

export default CalendarTab;
