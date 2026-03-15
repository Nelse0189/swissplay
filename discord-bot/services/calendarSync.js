/**
 * Calendar Sync Service
 * Syncs calendarEvents from Firestore to Discord Scheduled Events.
 * Listens for create/update/delete and creates/updates/deletes Discord native events.
 */
import { getFirestore } from '../firebase/config.js';
import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel
} from 'discord.js';

export function setupCalendarSyncListener(client) {
  try {
    const db = getFirestore();
    if (!db) {
      console.error('❌ Firestore not available, skipping calendar sync');
      return;
    }

    const calendarEventsRef = db.collection('calendarEvents');
    console.log('👂 Setting up Firestore listener for calendar events sync...');

    calendarEventsRef.onSnapshot(async (snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        const docId = change.doc.id;
        const data = change.doc.data();
        const discordGuildId = data.discordGuildId;

        if (!discordGuildId) continue;

        const guild = client.guilds.cache.get(discordGuildId);
        if (!guild) continue;

        try {
          if (change.type === 'added') {
            await createDiscordEvent(client, guild, docId, data, db);
          } else if (change.type === 'modified') {
            await updateDiscordEvent(client, guild, docId, data, db);
          } else if (change.type === 'removed') {
            await deleteDiscordEvent(guild, data);
          }
        } catch (error) {
          console.error(`❌ Calendar sync error for ${docId}:`, error.message);
        }
      }
    });

    console.log('✅ Calendar sync listener active');
  } catch (error) {
    console.error('❌ Failed to setup calendar sync:', error.message);
  }
}

async function createDiscordEvent(client, guild, docId, data, db) {
  if (data.discordEventId) return;

  const startTime = data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime);
  const endTime = data.endTime?.toDate ? data.endTime.toDate() : new Date(data.endTime);

  const baseOptions = {
    name: data.title || 'Event',
    description: (data.description || 'See event details.').substring(0, 1000),
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly
  };

  let options;

  if (data.discordVoiceChannelId) {
    const channel = guild.channels.cache.get(data.discordVoiceChannelId);
    if (channel?.isVoiceBased?.()) {
      options = {
        ...baseOptions,
        entityType: GuildScheduledEventEntityType.Voice,
        channel: data.discordVoiceChannelId
      };
    }
  }

  if (!options) {
    options = {
      ...baseOptions,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: {
        location: data.description?.substring(0, 100) || 'Team event'
      }
    };
  }

  if (data.recurrenceRule) {
    const rrule = data.recurrenceRule.startsWith('RRULE:')
      ? data.recurrenceRule
      : `RRULE:${data.recurrenceRule}`;
    options.recurrenceRule = rrule;
  }

  const scheduledEvent = await guild.scheduledEvents.create(options);

  await db.collection('calendarEvents').doc(docId).update({
    discordEventId: scheduledEvent.id,
    updatedAt: new Date()
  });

  console.log(`✅ Created Discord event: ${scheduledEvent.name} (${scheduledEvent.id})`);
}

async function updateDiscordEvent(client, guild, docId, data, db) {
  const discordEventId = data.discordEventId;
  if (!discordEventId) {
    await createDiscordEvent(client, guild, docId, data, db);
    return;
  }

  let scheduledEvent = guild.scheduledEvents.cache.get(discordEventId);
  if (!scheduledEvent) {
    try {
      scheduledEvent = await guild.scheduledEvents.fetch(discordEventId);
    } catch (_) {}
  }
  if (!scheduledEvent) {
    console.warn(`Discord event ${discordEventId} not found, recreating...`);
    await db.collection('calendarEvents').doc(docId).update({
      discordEventId: null,
      updatedAt: new Date()
    });
    await createDiscordEvent(client, guild, docId, data, db);
    return;
  }

  const startTime = data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime);
  const endTime = data.endTime?.toDate ? data.endTime.toDate() : new Date(data.endTime);

  const editOptions = {
    name: data.title || 'Event',
    description: (data.description || 'See event details.').substring(0, 1000),
    scheduledStartTime: startTime,
    scheduledEndTime: endTime
  };

  if (data.discordVoiceChannelId) {
    const channel = guild.channels.cache.get(data.discordVoiceChannelId);
    if (channel?.isVoiceBased?.()) {
      editOptions.entityType = GuildScheduledEventEntityType.Voice;
      editOptions.channel = data.discordVoiceChannelId;
    }
  } else {
    editOptions.entityType = GuildScheduledEventEntityType.External;
    editOptions.entityMetadata = {
      location: data.description?.substring(0, 100) || 'Team event'
    };
  }

  if (data.recurrenceRule) {
    editOptions.recurrenceRule = data.recurrenceRule.startsWith('RRULE:')
      ? data.recurrenceRule
      : `RRULE:${data.recurrenceRule}`;
  } else {
    editOptions.recurrenceRule = null;
  }

  await scheduledEvent.edit(editOptions);
  console.log(`✅ Updated Discord event: ${scheduledEvent.name}`);
}

async function deleteDiscordEvent(guild, data) {
  const discordEventId = data.discordEventId;
  if (!discordEventId) return;

  try {
    const scheduledEvent = guild.scheduledEvents.cache.get(discordEventId);
    if (scheduledEvent) {
      await scheduledEvent.delete();
      console.log(`✅ Deleted Discord event: ${data.title}`);
    }
  } catch (error) {
    if (error.code !== 10008) {
      console.error('Failed to delete Discord event:', error.message);
    }
  }
}
