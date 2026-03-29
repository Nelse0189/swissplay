import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { rrulestr } from 'rrule';
import { db } from '../../firebase/config';
import './ScheduleTab.css';

const UPCOMING_HORIZON_DAYS = 56;

const EVENT_TYPE_EMOJI = {
  scrim: '⚔️',
  game: '🎮',
  meetup: '👋',
  custom: '📌',
  vod: '🎬',
  match: '🏅',
  practice: '🎯',
  tournament: '🏆'
};

const EVENT_TYPE_LABEL = {
  scrim: 'Scrim',
  game: 'Game',
  meetup: 'Meetup',
  custom: 'Custom',
  vod: 'VOD',
  match: 'Match',
  practice: 'Practice',
  tournament: 'Tournament'
};

/** Expand recurring events into upcoming instances (end not yet passed). Omits auto-synced scrim duplicates. */
function buildUpcomingCalendarInstances(rawEvents, now, horizonEnd) {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const instances = [];

  for (const ev of rawEvents) {
    if (ev.scrimRequestId) continue;

    const startDate = ev.startTime?.toDate ? ev.startTime.toDate() : new Date(ev.startTime);
    const endDate = ev.endTime?.toDate ? ev.endTime.toDate() : new Date(ev.endTime);
    const durationMs = endDate - startDate;

    if (ev.recurrenceRule) {
      try {
        const rrule = rrulestr(
          ev.recurrenceRule.startsWith('RRULE:') ? ev.recurrenceRule : `RRULE:${ev.recurrenceRule}`
        );
        const occurrences = rrule.between(windowStart, horizonEnd, true);
        for (const occ of occurrences) {
          const occStart = occ instanceof Date ? occ : new Date(occ);
          const occEnd = new Date(occStart.getTime() + durationMs);
          if (occEnd < now) continue;
          if (occStart > horizonEnd) continue;
          instances.push({
            ...ev,
            occurrenceStart: occStart,
            occurrenceEnd: occEnd,
            instanceKey: `${ev.id}-${occStart.toISOString()}`
          });
        }
      } catch {
        if (endDate >= now && startDate <= horizonEnd) {
          instances.push({
            ...ev,
            occurrenceStart: startDate,
            occurrenceEnd: endDate,
            instanceKey: ev.id
          });
        }
      }
    } else if (endDate >= now && startDate <= horizonEnd) {
      instances.push({
        ...ev,
        occurrenceStart: startDate,
        occurrenceEnd: endDate,
        instanceKey: ev.id
      });
    }
  }

  instances.sort((a, b) => a.occurrenceStart - b.occurrenceStart);
  return instances;
}

const ScheduleTab = ({ team, members, currentUser }) => {
  const [scheduledScrims, setScheduledScrims] = useState([]);
  const [calendarInstances, setCalendarInstances] = useState([]);
  const [loading, setLoading] = useState(true);

  const timeZone = team?.scheduleTimezone || 'America/New_York';

  const dateTimeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }),
    [timeZone]
  );

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        hour: 'numeric',
        minute: '2-digit'
      }),
    [timeZone]
  );

  useEffect(() => {
    if (team && team.id) {
      loadScheduleData();
    }
  }, [team?.id]);

  const loadScheduleData = async () => {
    setLoading(true);
    const requestsRef = collection(db, 'scrimRequests');
    const q1 = query(
      requestsRef,
      where('status', '==', 'accepted'),
      where('fromTeamId', '==', team.id)
    );
    const q2 = query(
      requestsRef,
      where('status', '==', 'accepted'),
      where('toTeamId', '==', team.id)
    );
    const calQ = query(collection(db, 'calendarEvents'), where('teamId', '==', team.id));

    try {
      const [snapshot1, snapshot2, calSnap] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
        getDocs(calQ)
      ]);

      const scrims1 = snapshot1.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        opponent: doc.data().toTeamName,
        isOutgoing: true
      }));

      const scrims2 = snapshot2.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        opponent: doc.data().fromTeamName,
        isOutgoing: false
      }));

      setScheduledScrims([...scrims1, ...scrims2]);

      const calEvents = calSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const now = new Date();
      const horizonEnd = new Date(now.getTime() + UPCOMING_HORIZON_DAYS * 24 * 60 * 60 * 1000);
      setCalendarInstances(buildUpcomingCalendarInstances(calEvents, now, horizonEnd));
    } catch (error) {
      console.error('Error loading schedule:', error);
      setScheduledScrims([]);
      setCalendarInstances([]);
    } finally {
      setLoading(false);
    }
  };

  // Sort members by role priority
  const getRolePriority = (roles) => {
    if (roles.includes('Owner')) return 0;
    if (roles.includes('Manager')) return 1;
    if (roles.includes('Coach')) return 2;
    return 3;
  };

  const sortedMembers = [...members].sort((a, b) => 
    getRolePriority(a.roles) - getRolePriority(b.roles)
  );

  // Group scrims by day
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const scrimsByDay = days.reduce((acc, day) => {
    acc[day] = scheduledScrims.filter(scrim => scrim.slot?.day === day);
    return acc;
  }, {});

  return (
    <div className="schedule-tab">
      <div className="roster-section">
        <h3>TEAM ROSTER</h3>
        <div className="roster-grid">
          {sortedMembers.map((member, index) => (
            <div key={index} className="roster-card">
              <div className="member-role">{member.roles.join(', ').toUpperCase()}</div>
              <div className="member-name">{member.name}</div>
              {member.playerRoles && (
                <div className="player-roles">{member.playerRoles.join(' | ')}</div>
              )}
              {member.discordUsername ? (
                <div className="discord-info" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#7289da' }}>
                  💬 Discord: {member.discordUsername}
                </div>
              ) : member.discordId ? (
                <div className="discord-info" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#ffaa00' }}>
                  💬 Discord: Username not available
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="schedule-section">
        <h3>SCHEDULED SCRIMS</h3>
        {loading ? (
          <div className="loading-schedule">LOADING SCHEDULE AND CALENDAR...</div>
        ) : scheduledScrims.length > 0 ? (
          <div className="schedule-calendar">
            {days.map(day => {
              const dayScrims = scrimsByDay[day];
              if (!dayScrims || dayScrims.length === 0) return null;

              return (
                <div key={day} className="day-column">
                  <div className="day-header">{day.toUpperCase()}</div>
                  <div className="day-scrims">
                    {dayScrims
                      .sort((a, b) => (a.slot?.hour || 0) - (b.slot?.hour || 0))
                      .map((scrim) => (
                        <div key={scrim.id} className="scrim-card">
                          <div className="scrim-time">
                            {scrim.slot?.hour || 0}:00 - {(scrim.slot?.hour || 0) + 1}:00
                          </div>
                          <div className="scrim-opponent">
                            VS {scrim.opponent}
                          </div>
                          <div className="scrim-status">
                            {scrim.isOutgoing ? 'OUTGOING' : 'INCOMING'}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="no-scrims">
            <p>NO SCHEDULED SCRIMS</p>
            <p className="subtext">ACCEPTED SCRIM REQUESTS WILL APPEAR HERE</p>
          </div>
        )}
      </div>

      <div className="calendar-events-section">
        <h3>UPCOMING CALENDAR</h3>
        {!loading && (
          <p className="calendar-events-hint">
            Matches, VODs, and other events from the Calendar tab ({timeZone.replace(/_/g, ' ')}).
          </p>
        )}
        {!loading && calendarInstances.length > 0 ? (
          <ul className="calendar-events-list">
            {calendarInstances.map((ev) => {
              const emoji =
                ev.colorEmoji || EVENT_TYPE_EMOJI[ev.eventType] || '📌';
              const typeLabel =
                EVENT_TYPE_LABEL[ev.eventType] || ev.eventType || 'Event';
              const start = ev.occurrenceStart;
              const end = ev.occurrenceEnd;
              const dayKey = (d) =>
                new Intl.DateTimeFormat('en-CA', {
                  timeZone,
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit'
                }).format(d);
              const sameDay = dayKey(start) === dayKey(end);
              const range = sameDay
                ? `${dateTimeFmt.format(start)} – ${timeFmt.format(end)}`
                : `${dateTimeFmt.format(start)} – ${dateTimeFmt.format(end)}`;
              return (
                <li
                  key={ev.instanceKey}
                  className={`calendar-event-card calendar-event-card--${(ev.eventType || 'custom').replace(/[^a-z0-9-]/gi, '')}`}
                >
                  <div className="calendar-event-card__meta">
                    <span className="calendar-event-card__emoji" aria-hidden>
                      {emoji}
                    </span>
                    <span className="calendar-event-card__type">{typeLabel}</span>
                  </div>
                  <div className="calendar-event-card__title">
                    {ev.title || 'Untitled event'}
                  </div>
                  <div className="calendar-event-card__time">{range}</div>
                </li>
              );
            })}
          </ul>
        ) : !loading ? (
          <div className="no-scrims calendar-events-empty">
            <p>NO UPCOMING CALENDAR EVENTS</p>
            <p className="subtext">
              ADD MATCHES, VODS, AND MORE IN THE CALENDAR TAB
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ScheduleTab;
