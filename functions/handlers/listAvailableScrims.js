/**
 * /list-available-scrims — Teams with an open scrim slot matching day + time
 * (same logic as Find Scrims on the website: team.schedule + not locked by active request).
 */
import { EmbedBuilder } from 'discord.js';
import admin from 'firebase-admin';
import { getAllTeams, getTeamByManagerDiscordId } from '../lib/firebase-helpers.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

function getFirestore() {
  return admin.firestore();
}

function parseTimeSlot(timeStr) {
  const parts = (timeStr || '').split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1] || '0', 10);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  if (Number.isNaN(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** True if team's schedule includes this exact day/time slot. */
function scheduleHasSlot(schedule, day, hour, minute) {
  if (!Array.isArray(schedule) || schedule.length === 0) return false;
  return schedule.some((s) => {
    if (s.day !== day) return false;
    if (Number(s.hour) !== hour) return false;
    const slotMin = Number(s.minute ?? 0);
    return slotMin === minute;
  });
}

async function getActiveScrimRequests(db) {
  const [pending, accepted] = await Promise.all([
    db.collection('scrimRequests').where('status', '==', 'pending').get(),
    db.collection('scrimRequests').where('status', '==', 'accepted').get(),
  ]);
  const out = [];
  pending.docs.forEach((d) => out.push({ id: d.id, ...d.data() }));
  accepted.docs.forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}

function slotMinuteFromRequest(req) {
  const m = req.slot?.minute;
  return m === undefined || m === null ? 0 : Number(m);
}

function isTeamLockedAtSlot(requests, teamId, day, hour, minute) {
  return requests.some((req) => {
    const slot = req.slot;
    if (!slot || slot.day !== day) return false;
    if (Number(slot.hour) !== hour) return false;
    if (slotMinuteFromRequest(req) !== minute) return false;
    return req.fromTeamId === teamId || req.toTeamId === teamId;
  });
}

export async function handleListAvailableScrimsSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const day = interaction.options.getString('day');
  const timeStr = interaction.options.getString('time');
  const region = interaction.options.getString('region') || 'All';
  const division = interaction.options.getString('division') || 'All';

  const parsed = parseTimeSlot(timeStr);
  if (!parsed) {
    await interaction.editReply({ content: '❌ Invalid time selection.' });
    return;
  }

  const { hour, minute } = parsed;
  const db = getFirestore();

  try {
    let myTeamId = null;
    try {
      const myTeam = await getTeamByManagerDiscordId(interaction.user.id);
      if (myTeam) myTeamId = myTeam.id;
    } catch (_) {}

    let teams = await getAllTeams();
    teams = teams.filter(
      (t) => t.members?.length > 0 || t.memberUids?.length > 0
    );

    if (region && region !== 'All') {
      teams = teams.filter((t) => t.region === region);
    }
    if (division && division !== 'All') {
      teams = teams.filter((t) => t.faceitDiv === division);
    }

    const requests = await getActiveScrimRequests(db);

    const available = [];
    for (const team of teams) {
      if (myTeamId && team.id === myTeamId) continue;
      if (!scheduleHasSlot(team.schedule, day, hour, minute)) continue;
      if (isTeamLockedAtSlot(requests, team.id, day, hour, minute)) continue;
      available.push(team);
    }

    const timeLabel =
      new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }) || `${hour}:${String(minute).padStart(2, '0')}`;

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Open scrim slots — ${day} at ${timeLabel}`)
      .setColor(0x5865f2)
      .setFooter({ text: `Schedules from SwissPlay • ${WEBSITE_URL}/scrims` });

    if (available.length === 0) {
      embed.setDescription(
        'No teams found with that slot open (or everyone is already booked / filtered out).\n\n' +
          'Teams must publish the slot on **Team Management → Availability** on the website.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    available.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const lines = available.slice(0, 20).map((t) => {
      const reg = t.region || '—';
      const div = t.faceitDiv || '—';
      const abbr = t.abbreviation ? ` [${t.abbreviation}]` : '';
      return `**${t.name || t.id}**${abbr} — ${reg} • ${div}`;
    });

    embed.setDescription(
      `**${available.length}** team(s) list this slot and have no pending/accepted scrim at that time.\n\n` +
        lines.join('\n') +
        (available.length > 20 ? `\n\n_…and ${available.length - 20} more — use filters or the website._` : '')
    );

    if (myTeamId) {
      embed.addFields({
        name: 'Tip',
        value:
          `Use \`/send-scrim-request\` (same weekday; whole-hour times) or **Find Scrims** on the website for half-hour slots and full workflow.`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('list-available-scrims:', error);
    await interaction.editReply({ content: `❌ Failed: ${error.message}` });
  }
}
