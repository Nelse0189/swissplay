import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import admin from 'firebase-admin';
import { getTeamByManagerDiscordId } from '../lib/firebase-helpers.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getHoursUntilScrim(day, hour, createdAt) {
  const now = new Date();
  const targetDayIndex = DAYS.indexOf(day);
  if (targetDayIndex === -1) return null;

  const created = createdAt?.toDate?.() || new Date(createdAt);
  let daysUntilTarget = targetDayIndex - created.getDay();
  if (daysUntilTarget < 0) daysUntilTarget += 7;

  const scrimDate = new Date(created);
  scrimDate.setDate(created.getDate() + daysUntilTarget);
  scrimDate.setHours(hour, 0, 0, 0);
  if (scrimDate < now) scrimDate.setDate(scrimDate.getDate() + 7);

  return (scrimDate - now) / (1000 * 60 * 60);
}

function formatSlotTime(day, hour) {
  return `${day} ${hour}:00`;
}

const RELIABILITY_DEFAULT = 100;

async function updateTeamReliability(db, teamId, delta) {
  if (!teamId) return;
  const teamRef = db.collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();
  const current = teamDoc.exists ? (teamDoc.data().reliabilityScore ?? RELIABILITY_DEFAULT) : RELIABILITY_DEFAULT;
  const next = Math.max(0, Math.min(100, current + delta));
  await teamRef.update({ reliabilityScore: next });
}

/**
 * Handle /drop-scrim - Manager drops/cancels an accepted scrim
 */
export async function handleDropScrimSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const db = admin.firestore();

  try {
    const myTeam = await getTeamByManagerDiscordId(interaction.user.id);
    if (!myTeam) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner to drop scrims.',
        ephemeral: true
      });
      return;
    }

    const requestsSnapshot = await db.collection('scrimRequests')
      .where('status', '==', 'accepted')
      .get();

    const myScrims = requestsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r =>
        (r.fromTeamId === myTeam.id || r.toTeamId === myTeam.id) &&
        r.slot?.day && r.slot?.hour !== undefined
      )
      .map(r => {
        const hoursUntil = getHoursUntilScrim(r.slot.day, r.slot.hour, r.createdAt);
        return { ...r, hoursUntil };
      })
      .filter(r => r.hoursUntil !== null && r.hoursUntil > 0)
      .sort((a, b) => a.hoursUntil - b.hoursUntil);

    if (myScrims.length === 0) {
      await interaction.editReply({
        content: '❌ No upcoming accepted scrims to drop.',
        ephemeral: true
      });
      return;
    }

    const options = myScrims.slice(0, 25).map(r => {
      const opp = r.fromTeamId === myTeam.id ? r.toTeamName : r.fromTeamName;
      return {
        label: `${opp} - ${formatSlotTime(r.slot.day, r.slot.hour)}`,
        value: r.id,
        description: r.hoursUntil < 24 ? `In ${Math.round(r.hoursUntil)}h` : ''
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`drop_scrim_${myTeam.id}`)
      .setPlaceholder('Select scrim to drop...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('Drop Scrim')
      .setDescription(
        `Select a scrim to cancel. Dropping within 24h of the scrim may result in a reliability penalty.`
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    console.error('Error in drop-scrim:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle the select menu + confirm for dropping a scrim
 */
export async function handleDropScrimSelectMenu(interaction, customId) {
  if (!customId.startsWith('drop_scrim_')) return false;
  const requestId = interaction.values?.[0];
  if (!requestId) return false;

  await interaction.update({
    content: 'Confirm dropping this scrim?',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`drop_confirm_${requestId}`)
          .setLabel('Yes, Drop Scrim')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('drop_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  });

  return true;
}

/**
 * Handle the confirm button for dropping
 */
export async function handleDropScrimConfirm(interaction, customId) {
  if (!customId.startsWith('drop_confirm_')) return false;
  const requestId = customId.replace('drop_confirm_', '');

  await interaction.deferUpdate();

  const db = admin.firestore();

  try {
    const requestRef = db.collection('scrimRequests').doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      await interaction.editReply({ content: '❌ Request no longer exists.', components: [] });
      return true;
    }

    const request = { id: requestDoc.id, ...requestDoc.data() };
    const myTeam = await getTeamByManagerDiscordId(interaction.user.id);

    if (!myTeam || (request.fromTeamId !== myTeam.id && request.toTeamId !== myTeam.id)) {
      await interaction.editReply({ content: '❌ You cannot drop this scrim.', components: [] });
      return true;
    }

    const hoursUntil = getHoursUntilScrim(request.slot.day, request.slot.hour, request.createdAt);
    const minHoursRequired = 24;
    const lastMinuteDropThreshold = 1;
    const cancellingTeamId = request.fromTeamId === myTeam.id ? request.fromTeamId : request.toTeamId;

    if (hoursUntil !== null && hoursUntil < lastMinuteDropThreshold && hoursUntil > 0) {
      await db.collection('droppedScrims').add({
        slotDay: request.slot.day,
        slotHour: request.slot.hour,
        droppedAt: new Date(),
        requestId: request.id
      });
    }

    let penalty = 0;
    if (request.status === 'accepted') penalty = -10;
    else if (hoursUntil !== null && hoursUntil < minHoursRequired) penalty = -3;
    else penalty = -1;

    await updateTeamReliability(db, cancellingTeamId, penalty);
    await requestRef.delete();

    await interaction.editReply({
      content: penalty < 0
        ? `✅ Scrim dropped. Reliability penalty applied (${penalty}).`
        : '✅ Scrim dropped.',
      components: []
    });
  } catch (error) {
    console.error('Error dropping scrim:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      components: []
    });
  }

  return true;
}
