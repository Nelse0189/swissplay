/**
 * /find-scrims — Same overlap + filters + smart sort as the website Find Scrims page.
 */
import { EmbedBuilder } from 'discord.js';
import admin from 'firebase-admin';
import {
  getAllTeams,
  getTeamsForDiscordMember,
} from '../lib/firebase-helpers.js';
import {
  findMatchingTeams,
  getMatchScore,
  getMatchingSlots,
  getRequestStatusForSlot,
  isSlotLockedForTeam,
  formatSlotLine,
} from '../lib/find-scrims-matching.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

function getFirestore() {
  return admin.firestore();
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

function teamChoiceLabel(t) {
  const base = t.abbreviation ? `${t.name} [${t.abbreviation}]` : t.name;
  return String(base).slice(0, 100);
}

function resolveMyTeam(userTeams, teamValue) {
  const hint = teamValue?.trim();
  if (!hint) {
    return {
      error:
        'Choose your team from the **team** dropdown (start typing your team name if needed).',
    };
  }
  const byId = userTeams.find((t) => t.id === hint);
  if (byId) return { team: byId };

  const q = hint.toLowerCase();
  const hits = userTeams.filter(
    (t) =>
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.abbreviation && t.abbreviation.toLowerCase() === q)
  );
  if (hits.length === 1) return { team: hits[0] };
  if (hits.length === 0) {
    return {
      error: `No team matched your selection. Pick **team** from the list again. Your teams: ${userTeams.map((t) => t.name).join(', ')}`,
    };
  }
  return {
    error: `Multiple teams matched **${hint}**: ${hits.map((t) => t.name).join(', ')}. Pick your team from the dropdown.`,
  };
}

/** Autocomplete for /find-scrims `team` — values are Firestore team IDs. */
export async function handleFindScrimsAutocomplete(interaction) {
  try {
    const focused = interaction.getFocusedOption?.();
    if (!focused || focused.name !== 'team') {
      interaction.respondAutocomplete([]);
      return;
    }

    const db = getFirestore();
    const guildId = interaction.guild?.id ?? null;
    let userTeams = await getTeamsForDiscordMember(db, interaction.user.id, guildId);
    if (userTeams.length === 0) {
      userTeams = await getTeamsForDiscordMember(db, interaction.user.id, null);
    }
    userTeams = userTeams.filter((t) => !t.deprecated);

    const q = focused.value.trim().toLowerCase();
    let choices = userTeams.map((t) => ({
      name: teamChoiceLabel(t),
      value: t.id,
    }));
    if (q) {
      choices = choices.filter(
        (c) => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
      );
    }

    interaction.respondAutocomplete(choices);
  } catch (err) {
    console.error('find-scrims autocomplete:', err);
    interaction.respondAutocomplete([]);
  }
}

export async function handleFindScrimsSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const db = getFirestore();
  const guildId = interaction.guild?.id ?? null;

  let userTeams = await getTeamsForDiscordMember(db, interaction.user.id, guildId);
  if (userTeams.length === 0) {
    userTeams = await getTeamsForDiscordMember(db, interaction.user.id, null);
  }
  userTeams = userTeams.filter((t) => !t.deprecated);

  if (userTeams.length === 0) {
    await interaction.editReply({
      content:
        '❌ No team linked to your Discord. Link your account on the website and join a team (Team Management → Settings).',
    });
    return;
  }

  const teamValue = interaction.options.getString('team');
  const resolved = resolveMyTeam(userTeams, teamValue);
  if (resolved.error) {
    await interaction.editReply({ content: `❌ ${resolved.error}` });
    return;
  }
  const myTeam = resolved.team;

  if (!myTeam.schedule?.length) {
    await interaction.editReply({
      content: `❌ **${myTeam.name}** has no published schedule. Set availability on the website first.`,
    });
    return;
  }

  const division = interaction.options.getString('division') || 'All';
  const region = interaction.options.getString('region') || 'All';
  const timezone = interaction.options.getString('timezone') || 'All';
  const day = interaction.options.getString('day') || 'All';
  const filters = { division, region, timezone, day };

  try {
    let allTeams = await getAllTeams();
    allTeams = allTeams.filter(
      (t) =>
        !t.deprecated && (t.members?.length > 0 || t.memberUids?.length > 0)
    );
    if (!allTeams.some((t) => t.id === myTeam.id)) {
      allTeams = [myTeam, ...allTeams];
    }

    const requests = await getActiveScrimRequests(db);
    const rawMatches = findMatchingTeams({
      allTeams,
      myTeamId: myTeam.id,
      filters,
    });

    const sorted = rawMatches
      .map((t) => ({ team: t, matchScore: getMatchScore(myTeam, t) }))
      .sort((a, b) => b.matchScore - a.matchScore);

    const maxTeams = 12;
    const maxSlots = 4;
    const lines = [];

    for (let i = 0; i < Math.min(sorted.length, maxTeams); i++) {
      const { team, matchScore } = sorted[i];
      const slots = getMatchingSlots(myTeam, team, day);
      const slotParts = slots.slice(0, maxSlots).map((slot) => {
        const status = getRequestStatusForSlot(requests, myTeam.id, team.id, slot);
        const myLocked = isSlotLockedForTeam(requests, myTeam.id, slot);
        const theirLocked = isSlotLockedForTeam(requests, team.id, slot);
        let state;
        if (status) state = String(status).toUpperCase();
        else if (myLocked || theirLocked) state = 'LOCKED';
        else state = 'OPEN';
        return `${formatSlotLine(slot, team)} → **${state}**`;
      });
      const moreSlots = slots.length > maxSlots ? ` _(+${slots.length - maxSlots} more)_` : '';
      const srDisp = typeof team.sr === 'number' ? `SR ${team.sr}` : team.sr || '—';
      lines.push(
        `**${team.name}** · ${matchScore}% match · ${team.region || '—'} · ${team.faceitDiv || '—'} · Rel ${team.reliabilityScore ?? 100} · ${srDisp}` +
          (slotParts.length
            ? `\n${slotParts.map((s) => `  ${s}`).join('\n')}${moreSlots}`
            : '\n  _(no overlapping slots)_')
      );
    }

    const filterBits = [
      division !== 'All' && `Division: ${division}`,
      region !== 'All' && `Region: ${region}`,
      timezone !== 'All' && `Timezone: ${timezone}`,
      day !== 'All' && `Day: ${day}`,
    ].filter(Boolean);
    const filterSummary = filterBits.length ? filterBits.join(' · ') : 'All divisions, regions, timezones, days';

    let body =
      `**Your team:** ${myTeam.name}\n**Filters:** ${filterSummary}\n_Sorted like the website (reliability, rank, schedule overlap, region)._\n\n`;
    body += lines.length
      ? lines.join('\n\n')
      : '_No opponents match. Try loosening filters or adding schedule slots on the website._';
    if (sorted.length > maxTeams) {
      body += `\n\n_Showing **${maxTeams}** of **${sorted.length}** matches — open **Find Scrims** on the site for the full list._`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Find scrims')
      .setDescription(body.slice(0, 4096))
      .setFooter({
        text: `OPEN = you can request on the site • /send-scrim-request uses whole hours • ${WEBSITE_URL}/scrims`,
      });

    const embeds = [embed];

    const incoming = requests.filter(
      (r) => r.toTeamId === myTeam.id && r.status === 'pending'
    );
    const outgoing = requests.filter((r) => r.fromTeamId === myTeam.id);

    let reqText = '';
    if (incoming.length) {
      reqText +=
        '**Incoming (pending)**\n' +
        incoming
          .slice(0, 10)
          .map((r) => `• **${r.fromTeamName}** — ${r.slot?.day ?? '?'} ${r.slot?.hour ?? '?'}:00`)
          .join('\n');
      if (incoming.length > 10) reqText += `\n_…+${incoming.length - 10} more_`;
      reqText += '\n\n';
    }
    if (outgoing.length) {
      reqText +=
        '**Outgoing**\n' +
        outgoing
          .slice(0, 10)
          .map(
            (r) =>
              `• **${r.toTeamName}** — ${r.slot?.day ?? '?'} ${r.slot?.hour ?? '?'}:00 · ${String(r.status || '').toUpperCase()}`
          )
          .join('\n');
      if (outgoing.length > 10) reqText += `\n_…+${outgoing.length - 10} more_`;
    }

    if (reqText.trim()) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`Scrim requests · ${myTeam.name}`)
          .setDescription(reqText.trim().slice(0, 4096))
      );
    }

    await interaction.editReply({ embeds });
  } catch (err) {
    console.error('find-scrims:', err);
    await interaction.editReply({ content: `❌ Failed: ${err.message}` });
  }
}
