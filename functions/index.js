/**
 * Solaris Discord Bot - Firebase Functions (HTTP Interactions)
 * 
 * Uses Discord's Interactions Endpoint URL - no gateway/websocket needed.
 * Set your Interactions Endpoint in Discord Developer Portal to:
 *   https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/discordInteractions
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { config } from 'firebase-functions';
import admin from 'firebase-admin';
import { verifyKey } from 'discord-interactions';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { createInteractionAdapter } from './interactionAdapter.js';
import * as discordApi from './discordApi.js';
import { getManagerTeams, getPlayerByDiscordId } from './lib/firebase-helpers.js';

admin.initializeApp();

function ensureDiscordConfig() {
  if (!process.env.DISCORD_TOKEN && config().discord?.token) {
    process.env.DISCORD_TOKEN = config().discord.token;
  }
  if (!process.env.DISCORD_PUBLIC_KEY && config().discord?.public_key) {
    process.env.DISCORD_PUBLIC_KEY = config().discord.public_key;
  }
}

function getFirestore() {
  return admin.firestore();
}

// --- Handler: add-player ---
async function addPlayerToTeam(db, team, user) {
  const existingMember = team.members?.find(m => m.discordId === user.id);
  if (existingMember) throw new Error('Player is already on this team.');
  const newMember = {
    discordId: user.id,
    discordUsername: user.username,
    name: user.globalName || user.username,
    roles: ['Player'],
    availability: [],
    availabilityText: 'Not set'
  };
  const updatedMembers = [...(team.members || []), newMember];
  await db.collection('teams').doc(team.id).update({ members: updatedMembers });
}

async function handleAddPlayerSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const managerDiscordId = interaction.user.id;
  const playerUser = interaction.options.getUser('player');
  if (!playerUser) {
    await interaction.followUp({ content: '❌ Please specify a player to add.', ephemeral: true });
    return;
  }
  const managerTeams = await getManagerTeams(db, managerDiscordId);
  if (managerTeams.length === 0) {
    await interaction.followUp({
      content: '❌ You are not a verified manager.\n\nPlease verify your Discord account on the website first (Team Management → Settings → "Verify Discord" button).',
      ephemeral: true
    });
    return;
  }
  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.followUp({ content: '❌ This command must be run in a server, not DMs.', ephemeral: true });
    return;
  }
  const allTeams = await db.collection('teams').where('discordGuildId', '==', guildId).get();
  const playerExistingTeam = allTeams.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .find(t => t.members?.some(m => m.discordId === playerUser.id));
  if (playerExistingTeam) {
    await interaction.followUp({
      content: `❌ ${playerUser.username} is already on **${playerExistingTeam.name}**. Remove them first if you want to move them to another team.`,
      ephemeral: true
    });
    return;
  }
  if (managerTeams.length === 1) {
    await addPlayerToTeam(db, managerTeams[0], playerUser);
    await interaction.followUp({
      content: `✅ Added ${playerUser.username} to **${managerTeams[0].name}** as a Player!\n\nThey can now use \`/my-availability\` and \`/my-team\` to see their team info.`,
      ephemeral: true
    });
    try {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🎮 Welcome to the Team!')
        .setDescription(`You've been added to **${managerTeams[0].name}** by ${interaction.user.username}!`)
        .addFields(
          { name: 'Set Your Availability', value: 'Use `/my-availability` to let your manager know when you can play.' },
          { name: 'View Team Info', value: 'Use `/my-team` to see your team roster and schedule.' }
        )
        .setColor(0x00ff00);
      await discordApi.sendDM(playerUser.id, { embeds: [discordApi.embedToApi(welcomeEmbed)] });
    } catch (dmError) {
      console.log('Could not DM player:', dmError.message);
    }
    return;
  }
  const sessionCode = Math.random().toString(36).slice(2, 10);
  await db.collection('addPlayerSessions').doc(sessionCode).set({
    managerId: managerDiscordId,
    playerId: playerUser.id,
    playerUsername: playerUser.username,
    guildId,
    teamIds: managerTeams.map(t => t.id),
    createdAt: new Date()
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`add_player_team_${sessionCode}`)
    .setPlaceholder('Choose which team to add them to')
    .addOptions(managerTeams.slice(0, 25).map(t => ({ label: (t.name || t.id).slice(0, 100), value: t.id })));
  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.followUp({
    content: `Select which team to add **${playerUser.username}** to:`,
    components: [row],
    ephemeral: true
  });
}

// --- Handler: add_player_team_ select menu ---
async function handleAddPlayerTeamSelect(interaction, sessionCode) {
  await interaction.update({ content: '⏳ Adding player to team...', components: [] });
  const db = getFirestore();
  const selectedTeamId = interaction.values?.[0];
  const sessionRef = db.collection('addPlayerSessions').doc(sessionCode);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    await interaction.followUp({ content: '❌ Session expired. Please run `/add-player` again.', ephemeral: true });
    return;
  }
  const session = sessionDoc.data();
  if (session.managerId !== interaction.user.id) {
    await interaction.followUp({ content: '❌ This is not your add-player session.', ephemeral: true });
    return;
  }
  if (!selectedTeamId || !session.teamIds?.includes(selectedTeamId)) {
    await interaction.followUp({ content: '❌ Invalid team selection.', ephemeral: true });
    return;
  }
  const teamDoc = await db.collection('teams').doc(selectedTeamId).get();
  if (!teamDoc.exists) {
    await interaction.followUp({ content: '❌ Team not found.', ephemeral: true });
    return;
  }
  const team = { id: teamDoc.id, ...teamDoc.data() };
  const playerUser = { id: session.playerId, username: session.playerUsername };
  await addPlayerToTeam(db, team, playerUser);
  await sessionRef.delete();
  await interaction.followUp({
    content: `✅ Added ${session.playerUsername} to **${team.name}** as a Player!`,
    ephemeral: true
  });
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('🎮 Welcome to the Team!')
      .setDescription(`You've been added to **${team.name}** by ${interaction.user.username}!`)
      .addFields(
        { name: 'Set Your Availability', value: 'Use `/my-availability` to let your manager know when you can play.' },
        { name: 'View Team Info', value: 'Use `/my-team` to see your team roster and schedule.' }
      )
      .setColor(0x00ff00);
    await discordApi.sendDM(session.playerId, { embeds: [discordApi.embedToApi(welcomeEmbed)] });
  } catch (dmError) {
    console.log('Could not DM player:', dmError.message);
  }
}

// --- Handler: help ---
async function handleHelpSlash(interaction) {
  const db = getFirestore();
  const isManager = (await getManagerTeams(db, interaction.user.id)).length > 0;
  const playerEmbed = new EmbedBuilder()
    .setTitle('🤖 SwissPlay Bot - Player Commands')
    .setDescription('Commands available to all players:')
    .setColor(0x7289da)
    .addFields(
      { name: '`/my-availability`', value: 'Set your availability via DM.' },
      { name: '`/my-team`', value: 'View your team roster and schedule.' },
      { name: '`/upcoming-scrims`', value: 'See all scheduled scrims.' },
      { name: '`/link`', value: 'Link your Discord account or join a team.' },
      { name: '`/help`', value: 'Show this help message' }
    )
    .setFooter({ text: 'All availability and team info is sent privately via DM.' });
  const embeds = [playerEmbed];
  if (isManager) {
    const managerEmbed = new EmbedBuilder()
      .setTitle('🛡️ Manager Commands')
      .setDescription('Additional commands for verified managers:')
      .setColor(0x00ff00)
      .addFields(
        { name: '`/add-player @user`', value: 'Add a Discord server member to your team.' },
        { name: '`/remove-player @user`', value: 'Remove a player from your team.' },
        { name: '`/schedule-scrim`', value: 'Schedule a scrim and poll your team.' },
        { name: '`/find-time`', value: 'Analyze team availability.' },
        { name: '`/team-stats`', value: 'View team analytics.' },
        { name: '`/list-players`', value: 'List all players with Discord status.' },
        { name: '`/find-free-agents`', value: 'Browse free agents.' }
      )
      .setFooter({ text: 'Manager verification required - verify on website first!' });
    embeds.push(managerEmbed);
  } else {
    playerEmbed.addFields({
      name: '🛡️ Want to Manage a Team?',
      value: 'Create a team on the website, then verify your Discord in Team Management → Settings.'
    });
  }
  await interaction.reply({ embeds, ephemeral: true });
}

// --- Router ---
async function routeInteraction(interaction) {
  const { type, data } = interaction;
  
  if (type === 3) {
    const customId = data?.custom_id || interaction.customId;
    const values = data?.values || interaction.values || [];
    if (customId?.startsWith('add_player_team_')) {
      await handleAddPlayerTeamSelect(interaction, customId.replace('add_player_team_', ''));
      return;
    }
    if (customId?.startsWith('avail_')) {
      const parts = customId.split('_');
      const requestId = parts[2];
      const responseType = parts[1];
      const { handleButtonAvailabilityResponse } = await import('./handlers/availability.js');
      await handleButtonAvailabilityResponse(interaction, requestId, responseType);
      return;
    }
    if (customId?.startsWith('verify_confirm_')) {
      const { handleVerificationConfirm } = await import('./handlers/verify.js');
      await handleVerificationConfirm(interaction, customId.replace('verify_confirm_', ''));
      return;
    }
    if (customId?.startsWith('verify_deny_')) {
      const { handleVerificationDeny } = await import('./handlers/verify.js');
      await handleVerificationDeny(interaction, customId.replace('verify_deny_', ''));
      return;
    }
    if (customId?.startsWith('join_team_')) {
      const { handleJoinTeamSelect } = await import('./handlers/link.js');
      await handleJoinTeamSelect(interaction, customId.replace('join_team_', ''), values[0]);
      return;
    }
    if (customId?.startsWith('schedule_scrim_team_')) {
      const { handleScheduleScrimTeamSelect } = await import('./handlers/scrim.js');
      await handleScheduleScrimTeamSelect(interaction, customId.replace('schedule_scrim_team_', ''), values[0]);
      return;
    }
    if (customId?.startsWith('scrim_')) {
      const parts = customId.split('_');
      const pollId = parts[2];
      const responseType = parts[1];
      const { handleScrimPollResponse } = await import('./handlers/scrim.js');
      await handleScrimPollResponse(interaction, pollId, responseType);
      return;
    }
  }
  
  if (type === 2) {
    const commandName = data?.name || interaction.commandName;
    switch (commandName) {
      case 'add-player':
        await handleAddPlayerSlash(interaction);
        break;
      case 'help':
        await handleHelpSlash(interaction);
        break;
      case 'remove-player':
        const { handleRemovePlayerSlash } = await import('./handlers/players.js');
        await handleRemovePlayerSlash(interaction);
        break;
      case 'link':
        const { handleLinkDiscordSlash } = await import('./handlers/link.js');
        await handleLinkDiscordSlash(interaction);
        break;
      case 'list-players':
        const { handleListPlayersSlash } = await import('./handlers/players.js');
        await handleListPlayersSlash(interaction);
        break;
      case 'my-availability':
        const { handleMyAvailabilitySlash } = await import('./handlers/availability.js');
        await handleMyAvailabilitySlash(interaction);
        break;
      case 'my-team':
        const { handleMyTeamSlash } = await import('./handlers/players.js');
        await handleMyTeamSlash(interaction);
        break;
      case 'schedule-scrim':
        const { handleScheduleScrimSlash } = await import('./handlers/scrim.js');
        await handleScheduleScrimSlash(interaction);
        break;
      case 'find-time':
        const { handleFindTimeSlash } = await import('./handlers/scrim.js');
        await handleFindTimeSlash(interaction);
        break;
      case 'team-stats':
        const { handleTeamStatsSlash } = await import('./handlers/players.js');
        await handleTeamStatsSlash(interaction);
        break;
      case 'upcoming-scrims':
        const { handleUpcomingScrimsSlash } = await import('./handlers/scrim.js');
        await handleUpcomingScrimsSlash(interaction);
        break;
      case 'find-free-agents':
        const { handleFindFreeAgentsSlash } = await import('./handlers/freeagents.js');
        await handleFindFreeAgentsSlash(interaction);
        break;
      case 'request-availability':
        const { handleAvailabilityRequestSlash } = await import('./handlers/availability.js');
        await handleAvailabilityRequestSlash(interaction);
        break;
      case 'verify-discord':
        const { handleVerifyDiscordSlash } = await import('./handlers/verify.js');
        await handleVerifyDiscordSlash(interaction);
        break;
      case 'upload-scrim':
        const { handleUploadScrimSlash } = await import('./handlers/scrim.js');
        await handleUploadScrimSlash(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
    }
  }
}

// --- Firestore trigger: send verification DM when new verification doc is created ---
export const onVerificationCreated = onDocumentCreated(
  { document: 'discordVerifications/{docId}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const verificationCode = event.params.docId;
    if (data.status !== 'pending' || data.discordUserId) return;

    if (data.isManagerVerification && data.teamId && data.userUid) {
      const db = admin.firestore();
      const teamDoc = await db.collection('teams').doc(data.teamId).get();
      if (!teamDoc.exists) return;
      const team = teamDoc.data();
      const manager = team.members?.find(m => m.uid === data.userUid);
      if (!manager?.discordId) {
        await db.collection('discordVerifications').doc(verificationCode).update({
          dmError: 'Manager Discord account not linked. Please run /link in Discord first.',
          dmSent: false
        });
        return;
      }
      const { sendVerificationDMToUser } = await import('./handlers/verifyDm.js');
      try {
        await sendVerificationDMToUser(manager.discordId, verificationCode, data.userEmail, data.userName, data.teamName, false, null);
        await db.collection('discordVerifications').doc(verificationCode).update({
          dmSent: true,
          dmSentAt: new Date(),
          discordUserId: manager.discordId
        });
      } catch (error) {
        console.error('Failed to send verification DM:', error);
        await db.collection('discordVerifications').doc(verificationCode).update({
          dmError: error.message,
          dmSent: false
        });
      }
    }
  }
);

// --- Scheduled: scrim reminders (every 5 min) ---
export const scrimReminders = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1' },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    const pollsSnapshot = await db.collection('scrimPolls').where('status', '==', 'active').get();
    for (const pollDoc of pollsSnapshot.docs) {
      const poll = { id: pollDoc.id, ...pollDoc.data() };
      const dateParts = (poll.date || '').match(/(\d{4})-(\d{2})-(\d{2})/);
      const timeParts = (poll.time || '').match(/(\d{1,2}):(\d{2})/);
      if (!dateParts || !timeParts) continue;
      const scrimDate = new Date(
        parseInt(dateParts[1]),
        parseInt(dateParts[2]) - 1,
        parseInt(dateParts[3]),
        parseInt(timeParts[1]),
        parseInt(timeParts[2])
      );
      const hoursUntil = (scrimDate - now) / (1000 * 60 * 60);
      if (hoursUntil <= 24 && hoursUntil > 23 && !poll.reminder24hSent) {
        await sendScrimReminder(db, poll, '24 hours', pollDoc);
      }
      if (hoursUntil <= 1 && hoursUntil > 0.5 && !poll.reminder1hSent) {
        await sendScrimReminder(db, poll, '1 hour', pollDoc);
      }
      if (hoursUntil < -2) {
        await pollDoc.ref.update({ status: 'completed' });
      }
    }
  }
);

async function sendScrimReminder(db, poll, timeframe, pollDoc) {
  const teamDoc = await db.collection('teams').doc(poll.teamId).get();
  if (!teamDoc.exists) return;
  const team = teamDoc.data();
  const responses = poll.responses || {};
  const confirmedIds = Object.entries(responses)
    .filter(([, r]) => r.response === 'Available')
    .map(([id]) => id);
  const { EmbedBuilder } = await import('discord.js');
  const embed = new EmbedBuilder()
    .setTitle(`⏰ Scrim Reminder - ${timeframe}!`)
    .setDescription(`Your scrim for **${team.name || poll.teamName}** is coming up!`)
    .addFields({ name: 'Date', value: poll.date, inline: true }, { name: 'Time', value: poll.time, inline: true })
    .setColor(0xffaa00);
  if (poll.notes) embed.addFields({ name: 'Notes', value: poll.notes, inline: false });
  for (const playerId of confirmedIds) {
    try {
      await discordApi.sendDM(playerId, { embeds: [discordApi.embedToApi(embed)] });
    } catch (e) {
      console.log('Could not send reminder to', playerId, e.message);
    }
  }
  if (timeframe === '24 hours') await pollDoc.ref.update({ reminder24hSent: true });
  else if (timeframe === '1 hour') await pollDoc.ref.update({ reminder1hSent: true });
}

// --- HTTP Handler ---
export const discordInteractions = onRequest(
  { region: 'us-central1' },
  async (req, res) => {
    ensureDiscordConfig();
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const rawBody = (req.rawBody && req.rawBody.toString) ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    
    const publicKey = process.env.DISCORD_PUBLIC_KEY || config().discord?.public_key;
    if (!publicKey) {
      console.error('DISCORD_PUBLIC_KEY not set');
      res.status(500).send('Server misconfigured');
      return;
    }
    
    const isValid = verifyKey(rawBody, signature, timestamp, publicKey);
    if (!isValid) {
      res.status(401).send('Invalid request signature');
      return;
    }
    
    const body = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
    
    if (body.type === 1) {
      res.status(200).json({ type: 1 });
      return;
    }
    
    const interaction = createInteractionAdapter(body);
    
    try {
      await routeInteraction(interaction);
      const response = interaction._response;
      if (response) {
        res.status(200).json(response);
      } else {
        res.status(200).json({ type: 4, data: { content: '✅ Done', flags: 64 } });
      }
    } catch (error) {
      console.error('Interaction error:', error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true });
        } else {
          await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
        const resp = interaction._response;
        if (resp) res.status(200).json(resp);
        else res.status(200).json({ type: 4, data: { content: `❌ Error: ${error.message}`, flags: 64 } });
      } catch (e) {
        res.status(200).json({ type: 4, data: { content: `❌ Error: ${error.message}`, flags: 64 } });
      }
    }
  }
);
