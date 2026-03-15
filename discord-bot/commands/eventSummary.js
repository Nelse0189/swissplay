/**
 * /event-summary - Show upcoming calendar events for teams in this server
 */
import { createRequire } from 'module';
import { EmbedBuilder } from 'discord.js';
import { getFirestore } from '../firebase/config.js';

const require = createRequire(import.meta.url);
const { rrulestr } = require('rrule');

const EVENT_TYPE_EMOJI = {
  scrim: '⚔️',
  practice: '🎯',
  tournament: '🏆',
  meetup: '👋',
  custom: '📌'
};

export async function handleEventSummarySlash(interaction) {
  const db = getFirestore();
  const guildId = interaction.guild?.id;

  if (!guildId) {
    await interaction.reply({ content: 'Use this command in a server channel.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const teamsSnapshot = await db
      .collection('teams')
      .where('discordGuildId', '==', guildId)
      .get();

    if (teamsSnapshot.empty) {
      await interaction.editReply('No teams linked to this server. Link your team in Team Management → Settings.');
      return;
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const allEvents = [];

    for (const teamDoc of teamsSnapshot.docs) {
      const team = { id: teamDoc.id, ...teamDoc.data() };
      const eventsSnapshot = await db
        .collection('calendarEvents')
        .where('teamId', '==', team.id)
        .where('startTime', '>=', now)
        .where('startTime', '<=', endDate)
        .orderBy('startTime', 'asc')
        .get();

      for (const evDoc of eventsSnapshot.docs) {
        const ev = { id: evDoc.id, ...evDoc.data(), teamName: team.name };
        const startTime = ev.startTime?.toDate ? ev.startTime.toDate() : new Date(ev.startTime);
        if (ev.recurrenceRule) {
          try {
            const rule = rrulestr(
              ev.recurrenceRule.startsWith('RRULE:') ? ev.recurrenceRule : `RRULE:${ev.recurrenceRule}`
            );
            const occurrences = rule.between(now, endDate, true);
            for (const occ of occurrences) {
              allEvents.push({ ...ev, occurrenceStart: occ });
            }
          } catch (_) {
            allEvents.push({ ...ev, occurrenceStart: startTime });
          }
        } else {
          allEvents.push({ ...ev, occurrenceStart: startTime });
        }
      }
    }

    allEvents.sort((a, b) => a.occurrenceStart - b.occurrenceStart);

    const embed = new EmbedBuilder()
      .setTitle('📅 Upcoming Events (Next 7 Days)')
      .setColor(0x7289da)
      .setTimestamp();

    if (allEvents.length === 0) {
      embed.setDescription('No upcoming events. Add events in **Team Management → Calendar** on the website.');
    } else {
      const fields = [];
      for (const ev of allEvents.slice(0, 15)) {
        const emoji = ev.colorEmoji || EVENT_TYPE_EMOJI[ev.eventType] || '📌';
        const timeStr = ev.occurrenceStart.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        let value = `${emoji} **${ev.title || 'Event'}** — ${timeStr}`;
        if (ev.teamName) value += ` • ${ev.teamName}`;
        if (ev.discordEventId && guildId) {
          value += `\n[View in Discord](${`https://discord.com/events/${guildId}/${ev.discordEventId}`})`;
        }
        fields.push({ name: '\u200b', value, inline: false });
      }
      embed.addFields(fields);
      if (allEvents.length > 15) {
        embed.setFooter({ text: `Showing 15 of ${allEvents.length} events` });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in handleEventSummarySlash:', error);
    await interaction.editReply('Failed to load events. Try again later.').catch(() => {});
  }
}
