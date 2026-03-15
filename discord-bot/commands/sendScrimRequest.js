import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getFirestore } from '../firebase/config.js';
import { getTeamByManagerDiscordId, getAllTeams } from '../utils/firebase-helpers.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getNextOccurrenceDate(day, hour) {
  const now = new Date();
  const targetDayIndex = DAYS.indexOf(day);
  if (targetDayIndex === -1) return null;

  let daysUntilTarget = targetDayIndex - now.getDay();
  if (daysUntilTarget < 0) daysUntilTarget += 7;
  else if (daysUntilTarget === 0 && now.getHours() >= hour) daysUntilTarget += 7;

  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + daysUntilTarget);
  targetDate.setHours(hour, 0, 0, 0);
  return targetDate;
}

/**
 * Handle /send-scrim-request - Manager sends scrim request to another team
 */
export async function handleSendScrimRequestSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const day = interaction.options.getString('day');
  const hour = interaction.options.getInteger('hour');
  const region = interaction.options.getString('region');
  const division = interaction.options.getString('division');

  const db = getFirestore();

  try {
    const myTeam = await getTeamByManagerDiscordId(interaction.user.id);
    if (!myTeam) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner of a team to send scrim requests. Use `/create-team` or get added via the website.',
        ephemeral: true
      });
      return;
    }

    let teams = await getAllTeams();
    teams = teams.filter(t =>
      t.id !== myTeam.id &&
      (t.members?.length > 0 || t.memberUids?.length > 0)
    );
    if (region && region !== 'All') {
      teams = teams.filter(t => t.region === region);
    }
    if (division && division !== 'All') {
      teams = teams.filter(t => t.faceitDiv === division);
    }

    if (teams.length === 0) {
      await interaction.editReply({
        content: `❌ No teams found matching your filters. Try ${WEBSITE_URL}/scrims to browse all teams.`,
        ephemeral: true
      });
      return;
    }

    const scheduledDate = getNextOccurrenceDate(day, hour);
    const slot = { day, hour, scheduledDate: scheduledDate || new Date() };

    const options = teams.slice(0, 25).map(t => ({
      label: `${t.name} (${t.abbreviation || t.region || '-'})`,
      value: t.id,
      description: `${t.region || '-'} • ${t.faceitDiv || '-'}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`send_scrim_${Date.now()}_${myTeam.id}_${day}_${hour}`)
      .setPlaceholder('Select team to request scrim...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('Send Scrim Request')
      .setDescription(
        `From **${myTeam.name}** for **${day}** at **${hour}:00**\n\n` +
        `Select a team below (${teams.length} match your filters):`
      )
      .setFooter({ text: 'The selected team will receive a DM to accept or reject.' });

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  } catch (error) {
    console.error('Error sending scrim request:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Handle the select menu for choosing target team - creates the scrim request
 */
export async function handleSendScrimSelectMenu(interaction, customId) {
  const parts = customId.split('_');
  if (parts.length < 6) return false;
  const [, , , myTeamId, day, hour] = parts;
  const targetTeamId = interaction.values?.[0];
  if (!targetTeamId) return false;

  await interaction.update({ content: '⏳ Sending scrim request...', components: [] });

  const db = getFirestore();

  try {
    const [myTeamDoc, targetTeamDoc] = await Promise.all([
      db.collection('teams').doc(myTeamId).get(),
      db.collection('teams').doc(targetTeamId).get()
    ]);

    if (!myTeamDoc.exists || !targetTeamDoc.exists) {
      await interaction.followUp({ content: '❌ Team not found.', ephemeral: true });
      return true;
    }

    const myTeam = { id: myTeamDoc.id, ...myTeamDoc.data() };
    const targetTeam = { id: targetTeamDoc.id, ...targetTeamDoc.data() };

    const hourNum = parseInt(hour, 10);
    const scheduledDate = getNextOccurrenceDate(day, hourNum);

    const requestData = {
      fromTeamId: myTeam.id,
      fromTeamName: myTeam.name,
      toTeamId: targetTeam.id,
      toTeamName: targetTeam.name,
      slot: { day, hour: hourNum, scheduledDate: scheduledDate || new Date() },
      status: 'pending',
      createdAt: new Date()
    };

    await db.collection('scrimRequests').add(requestData);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Scrim Request Sent!')
      .setDescription(
        `Request sent to **${targetTeam.name}** for **${day}** at **${hourNum}:00**.\n\n` +
        'Their managers will receive a DM to accept or reject. You\'ll see the result on the website.'
      )
      .setFooter({ text: `${WEBSITE_URL}/scrims` });

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error('Error creating scrim request:', error);
    await interaction.followUp({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true
    });
  }

  return true;
}
