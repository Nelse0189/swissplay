import React, { useState, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { useToast } from '../../context/ToastContext';
import CustomDropdown from '../UI/CustomDropdown';
import ImageCropper from '../UI/ImageCropper';
import { createPortal } from 'react-dom';
import { RRule } from 'rrule';
import { format } from 'date-fns';

const EVENT_TYPES = [
  { value: 'scrim', label: 'Scrim' },
  { value: 'practice', label: 'Practice' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'meetup', label: 'Meetup' },
  { value: 'custom', label: 'Custom' }
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
  { value: 'custom', label: 'Custom RRULE' }
];

const REMINDER_OPTIONS = [
  { value: 15, label: '15 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '24 hours before' },
  { value: 10080, label: '1 week before' }
];

const COLOR_EMOJI_OPTIONS = [
  { value: '⚔️', label: '⚔️ Scrim' },
  { value: '🎯', label: '🎯 Practice' },
  { value: '🏆', label: '🏆 Tournament' },
  { value: '👋', label: '👋 Meetup' },
  { value: '📌', label: '📌 Custom' },
  { value: '📅', label: '📅 Event' },
  { value: '🔔', label: '🔔 Reminder' }
];

const EVENT_TYPE_DEFAULT_EMOJI = {
  scrim: '⚔️',
  practice: '🎯',
  tournament: '🏆',
  meetup: '👋',
  custom: '📌'
};

function getDefaultRecurrenceRule(recurrence, startDate) {
  if (!recurrence || recurrence === 'none') return null;
  const dtstart = startDate || new Date();
  switch (recurrence) {
    case 'daily':
      return new RRule({ freq: RRule.DAILY, dtstart }).toString();
    case 'weekly':
      return new RRule({ freq: RRule.WEEKLY, dtstart }).toString();
    case 'weekdays':
      return new RRule({ freq: RRule.WEEKLY, byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR], dtstart }).toString();
    default:
      return null;
  }
}

const CalendarEventForm = ({ team, event, initialSlot, onSave, onDelete, onClose }) => {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('21:00');
  const [eventType, setEventType] = useState('scrim');
  const [recurrence, setRecurrence] = useState('none');
  const [customRrule, setCustomRrule] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [discordVoiceChannelId, setDiscordVoiceChannelId] = useState('');
  const [reminders, setReminders] = useState([60, 1440]);
  const [colorEmoji, setColorEmoji] = useState('⚔️');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (event) {
      const st = event.startTime?.toDate ? event.startTime.toDate() : new Date(event.startTime);
      const et = event.endTime?.toDate ? event.endTime.toDate() : new Date(event.endTime);
      setTitle(event.title || '');
      setDescription(event.description || '');
      setStartDate(format(st, 'yyyy-MM-dd'));
      setStartTime(format(st, 'HH:mm'));
      setEndDate(format(et, 'yyyy-MM-dd'));
      setEndTime(format(et, 'HH:mm'));
      setEventType(event.eventType || 'scrim');
      setRecurrence(event.recurrenceRule ? 'custom' : 'none');
      setCustomRrule(event.recurrenceRule || '');
      setCoverImageUrl(event.coverImageUrl || null);
      setDiscordVoiceChannelId(event.discordVoiceChannelId || '');
      setReminders(event.reminders || [60, 1440]);
      setColorEmoji(event.colorEmoji || EVENT_TYPE_DEFAULT_EMOJI[event.eventType] || '⚔️');
    } else if (initialSlot) {
      const st = initialSlot.start;
      const et = initialSlot.end;
      setStartDate(format(st, 'yyyy-MM-dd'));
      setStartTime(format(st, 'HH:mm'));
      setEndDate(format(et, 'yyyy-MM-dd'));
      setEndTime(format(et, 'HH:mm'));
      setColorEmoji(EVENT_TYPE_DEFAULT_EMOJI[eventType]);
    } else {
      const now = new Date();
      const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setStartDate(format(now, 'yyyy-MM-dd'));
      setEndDate(format(end, 'yyyy-MM-dd'));
    }
  }, [event, initialSlot]);

  const toggleReminder = (mins) => {
    setReminders((prev) =>
      prev.includes(mins) ? prev.filter((m) => m !== mins) : [...prev, mins].sort((a, b) => a - b)
    );
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (croppedBlob) => {
    if (!team?.id || !croppedBlob) return;
    setUploadingImage(true);
    try {
      const fileName = `event-cover-${Date.now()}.webp`;
      const storageRef = ref(storage, `calendar-events/${team.id}/${fileName}`);
      await uploadBytes(storageRef, croppedBlob);
      const url = await getDownloadURL(storageRef);
      setCoverImageUrl(url);
      setShowCropper(false);
      setImageToCrop(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const recurrenceRule = React.useMemo(() => {
    if (recurrence === 'none') return null;
    if (recurrence === 'custom' && customRrule.trim()) return customRrule.trim();
    const start = startDate && startTime
      ? new Date(`${startDate}T${startTime}`)
      : new Date();
    return getDefaultRecurrenceRule(recurrence, start);
  }, [recurrence, customRrule, startDate, startTime]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      if (end <= start) {
        toast.error('End must be after start');
        setSaving(false);
        return;
      }
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        startTime: Timestamp.fromDate(start),
        endTime: Timestamp.fromDate(end),
        recurrenceRule,
        eventType,
        coverImageUrl: coverImageUrl || null,
        discordVoiceChannelId: discordVoiceChannelId.trim() || null,
        reminders,
        colorEmoji: colorEmoji || null
      });
    } catch (err) {
      toast.error('Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const modalContent = (
    <div className="calendar-event-form-backdrop" onClick={handleBackdropClick}>
      <div className="calendar-event-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="calendar-event-form-header">
          <h3>{event ? 'EDIT EVENT' : 'NEW EVENT'}</h3>
          <button type="button" className="form-close-btn" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="calendar-event-form-body">
          <div className="form-row">
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="custom-input"
                required
              />
            </div>
            <div className="form-group">
              <label>Event Type</label>
              <CustomDropdown
                options={EVENT_TYPES}
                value={eventType}
                onChange={setEventType}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Description (Markdown supported)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Event description..."
              className="custom-input"
              rows={3}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start</label>
              <div className="datetime-inputs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="custom-input"
                  required
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="custom-input"
                />
              </div>
            </div>
            <div className="form-group">
              <label>End</label>
              <div className="datetime-inputs">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="custom-input"
                  required
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="custom-input"
                />
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Recurrence</label>
              <CustomDropdown
                options={RECURRENCE_OPTIONS}
                value={recurrence}
                onChange={setRecurrence}
              />
            </div>
            {recurrence === 'custom' && (
              <div className="form-group flex-1">
                <label>RRULE (e.g. FREQ=WEEKLY;BYDAY=MO,WE)</label>
                <input
                  type="text"
                  value={customRrule}
                  onChange={(e) => setCustomRrule(e.target.value)}
                  placeholder="FREQ=WEEKLY;BYDAY=MO,WE"
                  className="custom-input"
                />
              </div>
            )}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Color Emoji (for summaries)</label>
              <CustomDropdown
                options={COLOR_EMOJI_OPTIONS}
                value={colorEmoji}
                onChange={setColorEmoji}
              />
            </div>
            {team?.discordGuildId && (
              <div className="form-group flex-1">
                <label>Discord Voice Channel ID (optional)</label>
                <input
                  type="text"
                  value={discordVoiceChannelId}
                  onChange={(e) => setDiscordVoiceChannelId(e.target.value)}
                  placeholder="Channel ID for event location"
                  className="custom-input"
                />
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Cover Image</label>
            <div className="cover-image-row">
              {coverImageUrl && (
                <div className="cover-preview">
                  <img src={coverImageUrl} alt="Cover" />
                  <button
                    type="button"
                    className="remove-cover-btn"
                    onClick={() => setCoverImageUrl(null)}
                  >
                    Remove
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="add-cover-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? 'Uploading...' : '+ Add Cover Image'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Reminders</label>
            <div className="reminders-row">
              {REMINDER_OPTIONS.map((opt) => (
                <label key={opt.value} className="reminder-checkbox">
                  <input
                    type="checkbox"
                    checked={reminders.includes(opt.value)}
                    onChange={() => toggleReminder(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions">
            {event && onDelete && (
              <button type="button" className="btn-delete" onClick={() => onDelete?.()}>
                Delete
              </button>
            )}
            <div className="form-actions-right">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="save-btn" disabled={saving}>
                {saving ? 'Saving...' : (event ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  const modalRoot = document.getElementById('modal-root') || document.body;

  return (
    <>
      {createPortal(modalContent, modalRoot)}
      {showCropper && imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            setShowCropper(false);
            setImageToCrop(null);
          }}
        />
      )}
    </>
  );
};

export default CalendarEventForm;
