import admin from 'firebase-admin';
import { EmbedBuilder } from 'discord.js';
import { getPlayerByDiscordId } from '../lib/firebase-helpers.js';
import * as discordApi from '../discordApi.js';

function getFirestore() {
  return admin.firestore();
}

export async function handleButtonAvailabilityResponse(interaction, requestId, responseType) {
  const db = getFirestore();
  const playerDiscordId = interaction.user.id;
  const requestRef = db.collection('availabilityRequests').doc(requestId);
  const requestDoc = await requestRef.get();
  if (!requestDoc.exists) {
    await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
    return;
  }
  const requestData = requestDoc.data();
  const teamId = requestData.teamId;
  const player = await getPlayerByDiscordId(playerDiscordId, teamId);
  if (!player) {
    await interaction.reply({ content: '❌ You are not linked to this team.', ephemeral: true });
    return;
  }
  let responseText = '', responseValue = false;
  switch (responseType) {
    case 'yes': responseText = '✅ Available'; responseValue = true; break;
    case 'no': responseText = '❌ Unavailable'; responseValue = false; break;
    case 'maybe': responseText = '⏰ Maybe'; responseValue = null; break;
  }
  const responses = requestData.responses || {};
  responses[playerDiscordId] = {
    playerName: player.name || interaction.user.username,
    playerUid: player.uid,
    response: responseText,
    responseValue,
    respondedAt: new Date()
  };
  await requestRef.update({ responses });
  await interaction.reply({
    content: `✅ Response recorded: ${responseText}\n\nIf you selected "Maybe", you can send a follow-up message with your time constraints.`,
    ephemeral: true
  });
  try {
    const notifyEmbed = new EmbedBuilder()
      .setTitle('📝 Availability Response')
      .setDescription(`${player.name || interaction.user.username} responded: ${responseText}`)
      .addFields({ name: 'Request ID', value: requestId })
      .setColor(responseValue === true ? 0x00ff00 : responseValue === false ? 0xff0000 : 0xffaa00);
    await discordApi.sendDM(requestData.managerDiscordId, { embeds: [discordApi.embedToApi(notifyEmbed)] });
  } catch (error) {
    console.error('Failed to notify manager:', error);
  }
}

export async function handleMyAvailabilitySlash(interaction) {
  await interaction.reply({ content: '📅 Check your DMs! I sent you a message to set your availability.', ephemeral: true });
  const user = interaction.user;
  const db = getFirestore();
  const teamsSnapshot = await db.collection('teams').get();
  const userTeams = teamsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => t.members?.some(m => m.discordId === user.id));
  if (userTeams.length === 0) {
    await discordApi.sendDM(user.id, {
      embeds: [discordApi.embedToApi(new EmbedBuilder()
        .setTitle('❌ Not on a Team')
        .setDescription('You\'re not currently on any team. Ask a manager to add you using `/add-player`.')
        .setColor(0xff0000))]
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setTitle('📅 Set Your Availability')
    .setDescription(
      'Let me know when you\'re available for scrims!\n\n' +
      '**Examples:**\n• "Weekdays after 6pm"\n• "Monday Wednesday Friday 7-10pm"\n• "Weekends anytime"\n\n' +
      '**Note:** With Firebase Functions, reply with availability in a new message. Use the format: "Mon 18-22, Wed 19-21" etc.'
    )
    .setColor(0x7289da)
    .setFooter({ text: 'Your availability will be saved and visible to your team manager.' });
  await discordApi.sendDM(user.id, { embeds: [discordApi.embedToApi(embed)] });
  await db.collection('pendingAvailabilityUpdates').doc(user.id).set({
    userId: user.id,
    username: user.username,
    teamIds: userTeams.map(t => t.id),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  });
}

export async function handleAvailabilityRequestSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { getTeamByManagerDiscordId } = await import('../lib/firebase-helpers.js');
  const db = getFirestore();
  const team = await getTeamByManagerDiscordId(interaction.user.id);
  if (!team) {
    await interaction.followUp({ content: '❌ You are not a manager of any team.', ephemeral: true });
    return;
  }
  const players = team.members?.filter(m => m.roles?.includes('Player') || m.roles?.includes('Coach')).filter(m => m.discordId) || [];
  if (players.length === 0) {
    await interaction.followUp({ content: '❌ No players with Discord linked.', ephemeral: true });
    return;
  }
  const requestRef = await db.collection('availabilityRequests').add({
    teamId: team.id,
    managerDiscordId: interaction.user.id,
    managerName: interaction.user.username,
    createdAt: new Date(),
    responses: {},
    status: 'pending'
  });
  const requestId = requestRef.id;
  const embed = new EmbedBuilder()
    .setTitle('📅 Availability Request')
    .setDescription('Please respond with your availability.')
    .setColor(0x00ff00)
    .addFields(
      { name: 'Team', value: team.name, inline: true },
      { name: 'Requested by', value: interaction.user.username, inline: true }
    );
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avail_yes_${requestId}`).setLabel('✅ Available').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`avail_no_${requestId}`).setLabel('❌ Unavailable').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`avail_maybe_${requestId}`).setLabel('⏰ Maybe').setStyle(ButtonStyle.Secondary)
  );
  const components = discordApi.componentsToApi([row]);
  let sent = 0;
  for (const p of players) {
    try {
      await discordApi.sendDM(p.discordId, { embeds: [discordApi.embedToApi(embed)], components });
      sent++;
    } catch (e) {
      console.error('Failed to DM player:', e);
    }
  }
  await interaction.followUp({
    content: `✅ Sent availability request to ${sent} player(s).`,
    ephemeral: true
  });
}
