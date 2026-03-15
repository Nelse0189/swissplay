/**
 * Calendar Event Reminders
 * Sends configurable reminders (15m, 1h, 24h, 1 week) before calendar events.
 * DMs team members with Discord linked. Supports timezone formatting when users have timezone set.
 */
import { createRequire } from 'module';
import { getFirestore } from '../firebase/config.js';
import { EmbedBuilder } from 'discord.js';

const require = createRequire(import.meta.url);
const { rrulestr } = require('rrule');

const REMINDER_WINDOW_MINUTES = 6;

export function setupCalendarReminderSystem(client) {
  console.log('⏰ Setting up calendar event reminder system...');

  setInterval(async () => {
    try {
      await checkAndSendCalendarReminders(client);
    } catch (error) {
      console.error('Error in calendar reminder system:', error);
    }
  }, 5 * 60 * 1000);

  setTimeout(() => checkAndSendCalendarReminders(client), 15000);

  console.log('✅ Calendar reminder system active');
}

async function checkAndSendCalendarReminders(client) {
  const db = getFirestore();
  if (!db) return;

  const now = new Date();
  const futureCutoff = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  try {
    const eventsSnapshot = await db.collection('calendarEvents').get();

    for (const doc of eventsSnapshot.docs) {
      const event = { id: doc.id, ...doc.data() };
      const reminders = event.reminders || [];

      if (reminders.length === 0) continue;

      const startTime = event.startTime?.toDate
        ? event.startTime.toDate()
        : new Date(event.startTime);
      let occurrenceStart = startTime;

      if (event.recurrenceRule) {
        try {
          const rule = rrulestr(
            event.recurrenceRule.startsWith('RRULE:')
              ? event.recurrenceRule
              : `RRULE:${event.recurrenceRule}`
          );
          const occurrences = rule.between(now, futureCutoff, true);
          if (occurrences.length === 0) continue;
          occurrenceStart = occurrences[0];
        } catch (_) {
          if (occurrenceStart < now) continue;
        }
      } else if (occurrenceStart < now) {
        continue;
      }

      const occurrenceKey = occurrenceStart.toISOString();
      const remindersSent = event.remindersSent || {};
      const sentForOccurrence = remindersSent[occurrenceKey] || {};

      for (const mins of reminders) {
        const minsMs = mins * 60 * 1000;
        const windowStart = new Date(occurrenceStart.getTime() - minsMs - REMINDER_WINDOW_MINUTES * 60 * 1000);
        const windowEnd = new Date(occurrenceStart.getTime() - minsMs + REMINDER_WINDOW_MINUTES * 60 * 1000);

        if (now >= windowStart && now <= windowEnd && !sentForOccurrence[mins]) {
          await sendCalendarReminder(client, db, event, doc.ref, occurrenceStart, mins);
        }
      }
    }
  } catch (error) {
    console.error('Error checking calendar reminders:', error);
  }
}

async function sendCalendarReminder(client, db, event, docRef, occurrenceStart, reminderMins) {
  const teamDoc = await db.collection('teams').doc(event.teamId).get();
  if (!teamDoc.exists) return;

  const team = teamDoc.data();
  const members = team.members || [];
  const discordIds = members
    .map((m) => m.discordId)
    .filter(Boolean);

  const timeframe =
    reminderMins < 60
      ? `${reminderMins} minutes`
      : reminderMins < 1440
        ? `${reminderMins / 60} hour${reminderMins === 60 ? '' : 's'}`
        : reminderMins < 10080
          ? `${reminderMins / 1440} day${reminderMins === 1440 ? '' : 's'}`
          : `${reminderMins / 10080} week`;

  const emoji = event.colorEmoji || '📅';
  const timeStr = occurrenceStart.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  for (const discordId of discordIds) {
    try {
      const user = await client.users.fetch(discordId);
      const member = members.find((m) => m.discordId === discordId);
      let userTimezone = null;
      try {
        const settingsDoc = await db.collection('discordUserSettings').doc(discordId).get();
        if (settingsDoc.exists) userTimezone = settingsDoc.data().timezone;
      } catch (_) {}
      if (!userTimezone && member?.uid) {
        try {
          const userDoc = await db.collection('users').doc(member.uid).get();
          if (userDoc.exists) userTimezone = userDoc.data().timezone;
        } catch (_) {}
      }

      let timeDisplay = timeStr;
      if (userTimezone) {
        try {
          timeDisplay = occurrenceStart.toLocaleString('en-US', {
            timeZone: userTimezone,
            dateStyle: 'medium',
            timeStyle: 'short'
          });
          timeDisplay += ` (your time)`;
        } catch (_) {}
      }

      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Event Reminder – ${timeframe}!`)
        .setDescription(`**${event.title || 'Event'}** is coming up.`)
        .addFields(
          { name: 'When', value: timeDisplay, inline: true },
          {
            name: 'Type',
            value: event.eventType || 'Event',
            inline: true
          }
        )
        .setColor(0xffaa00);

      if (event.description) {
        embed.addFields({
          name: 'Details',
          value: event.description.substring(0, 500) + (event.description.length > 500 ? '...' : ''),
          inline: false
        });
      }

      await user.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send calendar reminder to ${discordId}:`, error.message);
    }
  }

  const occurrenceKey = occurrenceStart.toISOString();
  const remindersSent = event.remindersSent || {};
  const sentForOccurrence = remindersSent[occurrenceKey] || {};
  sentForOccurrence[reminderMins] = true;
  remindersSent[occurrenceKey] = sentForOccurrence;

  await docRef.update({
    remindersSent,
    updatedAt: new Date()
  });

  console.log(
    `⏰ Sent ${timeframe} calendar reminder for "${event.title}" (${discordIds.length} members)`
  );
}
