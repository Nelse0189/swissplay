/**
 * Syncs Firestore calendarEvents ↔ Discord Scheduled Events (REST).
 * Replaces the former discord-bot Firestore listener.
 */
import * as discordApi from '../discordApi.js';

function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  return new Date(v);
}

/** True if only sync bookkeeping fields changed (avoid update loops). */
function onlyMetadataChanged(before, after) {
  if (!before?.exists) return false;
  const skip = new Set([
    'discordEventId',
    'discordEventAutoStarted',
    'discordEventAutoEnded',
    'updatedAt',
    'remindersSent',
    'channelRemindersSent',
  ]);
  const b = before.data() || {};
  const a = after.data() || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    if (skip.has(k)) continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) return false;
  }
  return true;
}

/**
 * @param {FirebaseFirestore.DocumentSnapshot|null} before
 * @param {FirebaseFirestore.DocumentSnapshot|null} after
 * @param {FirebaseFirestore.Firestore} db
 */
export async function handleCalendarEventWrite(before, after, db) {
  // Deleted
  if (!after.exists) {
    if (!before?.exists) return;
    const prev = before.data();
    const guildId = prev?.discordGuildId;
    const eventId = prev?.discordEventId;
    if (guildId && eventId) {
      try {
        await discordApi.deleteScheduledEvent(guildId, eventId);
      } catch (e) {
        console.warn('calendar sync delete:', e.message);
      }
    }
    return;
  }

  let data = after.data();
  let guildId = data.discordGuildId;
  const docRef = after.ref;

  if (!guildId && data.teamId) {
    try {
      const teamDoc = await db.collection('teams').doc(data.teamId).get();
      const tg = teamDoc.exists ? teamDoc.data()?.discordGuildId : null;
      if (tg) {
        await docRef.update({
          discordGuildId: tg,
          updatedAt: new Date(),
        });
        // Re-trigger will run with guildId set; continuing here races a parallel
        // invocation (same update) that also sees no discordEventId → duplicate Discord events.
        return;
      }
    } catch (e) {
      console.warn('calendar sync: could not resolve guild:', e.message);
    }
  }

  if (!guildId) return;

  if (before?.exists && onlyMetadataChanged(before, after)) return;

  const startTime = toDate(data.startTime);
  const endTime = toDate(data.endTime);
  if (!startTime || !endTime || isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return;

  const name = (data.title || 'Event').substring(0, 100);
  const description = (data.description || 'See event details.').substring(0, 1000);
  const locSource = (data.description || data.title || 'Team event').substring(0, 100);

  try {
    if (data.discordEventId) {
      const patch = {
        name,
        description,
        scheduled_start_time: startTime.toISOString(),
        scheduled_end_time: endTime.toISOString(),
      };
      if (data.discordVoiceChannelId) {
        patch.entity_type = 2;
        patch.channel_id = data.discordVoiceChannelId;
      } else {
        patch.entity_type = 3;
        patch.entity_metadata = { location: locSource };
      }
      await discordApi.updateScheduledEvent(guildId, data.discordEventId, patch);
      return;
    }

    let created;
    if (data.discordVoiceChannelId) {
      created = await discordApi.createVoiceScheduledEvent(guildId, {
        name,
        description,
        startTime,
        endTime,
        channelId: data.discordVoiceChannelId,
      });
    } else {
      created = await discordApi.createScheduledEvent(guildId, {
        name,
        description,
        startTime,
        endTime,
        location: locSource,
      });
    }

    if (created?.id) {
      await docRef.update({
        discordEventId: created.id,
        updatedAt: new Date(),
      });
    }
  } catch (e) {
    console.error('calendar sync error:', e.message);
  }
}
