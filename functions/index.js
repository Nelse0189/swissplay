/**
 * Solaris Discord Bot - Firebase Functions (HTTP Interactions)
 * 
 * Uses Discord's Interactions Endpoint URL - no gateway/websocket needed.
 * Set your Interactions Endpoint in Discord Developer Portal to:
 *   https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/discordInteractions
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { config } from 'firebase-functions';
import admin from 'firebase-admin';
import { verifyKey } from 'discord-interactions';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { createInteractionAdapter } from './interactionAdapter.js';
import * as discordApi from './discordApi.js';
import { getManagerTeams, getPlayerByDiscordId, ensureTeamLinkedToGuild } from './lib/firebase-helpers.js';

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
async function addPlayerToTeam(db, team, user, playerRolesStr) {
  const playerRoles = playerRolesStr ? playerRolesStr.split(',').map(r => r.trim()) : [];
  
  const existingMemberIndex = team.members?.findIndex(m => m.discordId === user.id) ?? -1;
  
  if (existingMemberIndex !== -1) {
    const existingMember = team.members[existingMemberIndex];
    const roles = existingMember.roles || [];
    
    if (!roles.includes('Player') || (playerRoles.length > 0 && JSON.stringify(existingMember.playerRoles) !== JSON.stringify(playerRoles))) {
      const updatedMembers = [...team.members];
      updatedMembers[existingMemberIndex] = {
        ...existingMember,
        roles: roles.includes('Player') ? roles : [...roles, 'Player'],
        playerRoles: playerRoles.length > 0 ? playerRoles : (existingMember.playerRoles || [])
      };
      
      await db.collection('teams').doc(team.id).update({
        members: updatedMembers
      });
      return;
    }
    
    throw new Error('Player is already on this team with this role.');
  }
  
  const newMember = {
    discordId: user.id,
    discordUsername: user.username,
    name: user.globalName || user.username,
    roles: ['Player'],
    playerRoles: playerRoles,
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
  const roleStr = interaction.options.getString('role');
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
    const isManagerTeam = managerTeams.some(t => t.id === playerExistingTeam.id);
    
    if (isManagerTeam) {
      await ensureTeamLinkedToGuild(db, playerExistingTeam.id, guildId);
      const existingMemberIndex = playerExistingTeam.members.findIndex(m => m.discordId === playerUser.id);
      const member = playerExistingTeam.members[existingMemberIndex];
      const playerRoles = roleStr ? roleStr.split(',').map(r => r.trim()) : [];
      
      if (member.roles?.includes('Player') && (playerRoles.length === 0 || JSON.stringify(member.playerRoles) === JSON.stringify(playerRoles))) {
        await interaction.followUp({
          content: `❌ ${playerUser.username} is already a Player on **${playerExistingTeam.name}** with this role.`,
          ephemeral: true
        });
        return;
      }
      
      const updatedMembers = [...playerExistingTeam.members];
      const roles = member.roles || [];
      updatedMembers[existingMemberIndex] = {
        ...member,
        roles: roles.includes('Player') ? roles : [...roles, 'Player'],
        playerRoles: playerRoles.length > 0 ? playerRoles : (member.playerRoles || [])
      };
      
      await ensureTeamLinkedToGuild(db, playerExistingTeam.id, guildId);
      await ensureTeamLinkedToGuild(db, playerExistingTeam.id, guildId);
      await db.collection('teams').doc(playerExistingTeam.id).update({
        members: updatedMembers
      });
      await interaction.followUp({
        content: `✅ Updated ${playerUser.username} on **${playerExistingTeam.name}**!\n\nThey can now use \`/my-availability\` and \`/my-team\` to see their team info.`,
        ephemeral: true
      });
      
      return;
    } else {
      await interaction.followUp({
        content: `❌ ${playerUser.username} is already on **${playerExistingTeam.name}**. Remove them first if you want to move them to another team.`,
        ephemeral: true
      });
      return;
    }
  }
  if (managerTeams.length === 1) {
    await ensureTeamLinkedToGuild(db, managerTeams[0].id, guildId);
    await addPlayerToTeam(db, managerTeams[0], playerUser, roleStr);
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
    roleStr: roleStr,
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
  const guildId = interaction.guild?.id;
  if (guildId) await ensureTeamLinkedToGuild(db, team.id, guildId);
  const playerUser = { id: session.playerId, username: session.playerUsername };
  
  const existingMemberIndex = team.members.findIndex(m => m.discordId === playerUser.id);
  
  if (existingMemberIndex !== -1) {
    const member = team.members[existingMemberIndex];
    const roleStr = session.roleStr;
    const playerRoles = roleStr ? roleStr.split(',').map(r => r.trim()) : [];
    
    if (member.roles?.includes('Player') && (playerRoles.length === 0 || JSON.stringify(member.playerRoles) === JSON.stringify(playerRoles))) {
      await interaction.followUp({
        content: `❌ ${playerUser.username} is already a Player on **${team.name}** with this role.`,
        ephemeral: true
      });
      await sessionRef.delete();
      return;
    }
    
    const updatedMembers = [...team.members];
    const roles = member.roles || [];
    updatedMembers[existingMemberIndex] = {
      ...member,
      roles: roles.includes('Player') ? roles : [...roles, 'Player'],
      playerRoles: playerRoles.length > 0 ? playerRoles : (member.playerRoles || [])
    };
    
    await db.collection('teams').doc(team.id).update({
      members: updatedMembers
    });
    
    await sessionRef.delete();
    
    await interaction.followUp({
      content: `✅ Updated ${session.playerUsername} on **${team.name}**!`,
      ephemeral: true
    });
    return;
  }
  
  await addPlayerToTeam(db, team, playerUser, session.roleStr);
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
async function handleVerifySrSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    let battletag = interaction.options.getString('battletag');
    const platform = interaction.options.getString('platform');
    const region = interaction.options.getString('region');
    
    // Replace # with - for the API
    battletag = battletag.replace('#', '-');
    
    const url = `https://best-overwatch-api.herokuapp.com/player/${platform}/${region}/${battletag}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.private) {
        await interaction.followUp({ content: `❌ The profile for **${battletag}** is private. Please set it to public in Overwatch to verify SR.` });
        return;
      }
      
      const rank = data.competitive?.rank;
      
      if (!rank) {
        await interaction.followUp({ content: `⚠️ No competitive rank found for **${battletag}**.` });
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`🏆 SR Verification: ${data.username || battletag}`)
        .addFields(
          { name: 'Level', value: data.level ? data.level.toString() : 'Unknown', inline: true },
          { name: 'Skill Rating', value: rank.toString(), inline: true }
        )
        .setColor(0x00ff00);
        
      if (data.competitive?.rank_img) {
        embed.setThumbnail(data.competitive.rank_img);
      } else if (data.portrait) {
        embed.setThumbnail(data.portrait);
      }
        
      await interaction.followUp({ embeds: [embed] });
      
    } catch (apiError) {
      console.error('Overwatch API Error:', apiError);
      
      // Fallback or error message since Herokuapp might be down
      await interaction.followUp({ 
        content: `❌ Could not fetch data for **${battletag}**. The Overwatch API might be down or the BattleTag is incorrect.\n\n*Error: ${apiError.message}*` 
      });
    }
  } catch (error) {
    console.error('Error handling verify-sr command:', error);
    await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
  }
}

// --- Handler: help ---
async function handleHelpSlash(interaction) {
  const db = getFirestore();
  const managerTeams = await getManagerTeams(db, interaction.user.id);
  const isManager = managerTeams.length > 0;
  const guildId = interaction.guild?.id;
  if (isManager && guildId && managerTeams.length === 1) {
    await ensureTeamLinkedToGuild(db, managerTeams[0].id, guildId);
  }
  const playerEmbed = new EmbedBuilder()
    .setTitle('🤖 SwissPlay Bot - Player Commands')
    .setDescription('Commands available to all players:')
    .setColor(0x7289da)
    .addFields(
      { name: '`/my-availability`', value: 'Set your availability via dropdown (or custom text).' },
      { name: '`/my-team`', value: 'View your team roster and schedule.' },
      { name: '`/upcoming-scrims`', value: 'See all scheduled scrims.' },
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

  // Modal submit (type 5) - e.g. availability form
  if (type === 5) {
    const customId = data?.custom_id;
    if (customId === 'availability_modal') {
      const { handleAvailabilityModalSubmit } = await import('./handlers/availability.js');
      await handleAvailabilityModalSubmit(interaction);
      return;
    }
    console.error('Unknown modal submit:', { customId, fullData: JSON.stringify(data) });
    await interaction.reply({ content: `❌ Unknown form (custom_id: ${customId || '(none)'}). Check Firebase logs.`, ephemeral: true });
    return;
  }
  
  if (type === 3) {
    const customId = data?.custom_id || interaction.customId;
    const values = data?.values || interaction.values || [];
    if (customId === 'availability_select') {
      const { handleAvailabilitySelect } = await import('./handlers/availability.js');
      await handleAvailabilitySelect(interaction, values[0]);
      return;
    }
    if (customId?.startsWith('flex_avail_')) {
      const { handleFlexibleAvailability } = await import('./handlers/availability.js');
      await handleFlexibleAvailability(interaction);
      return;
    }
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
    if (customId?.startsWith('send_scrim_')) {
      const { handleSendScrimSelectMenu } = await import('./handlers/sendScrimRequest.js');
      await handleSendScrimSelectMenu(interaction, customId);
      return;
    }
    if (customId?.startsWith('drop_scrim_')) {
      const { handleDropScrimSelectMenu } = await import('./handlers/dropScrim.js');
      await handleDropScrimSelectMenu(interaction, customId);
      return;
    }
    if (customId?.startsWith('drop_confirm_')) {
      const { handleDropScrimConfirm } = await import('./handlers/dropScrim.js');
      await handleDropScrimConfirm(interaction, customId);
      return;
    }
    if (customId === 'drop_cancel') {
      await interaction.update({ content: 'Cancelled.', components: [] });
      return;
    }
    if (customId?.startsWith('edit_event_')) {
      const { handleEditEventSelectMenu } = await import('./handlers/calendar.js');
      await handleEditEventSelectMenu(interaction, customId);
      return;
    }
    if (customId?.startsWith('delete_event_')) {
      const { handleDeleteEventSelectMenu } = await import('./handlers/calendar.js');
      await handleDeleteEventSelectMenu(interaction, customId);
      return;
    }
    if (customId?.startsWith('del_event_confirm_')) {
      const { handleDeleteEventConfirm } = await import('./handlers/calendar.js');
      await handleDeleteEventConfirm(interaction, customId);
      return;
    }
    if (customId === 'del_event_cancel') {
      await interaction.update({ content: 'Cancelled.', components: [] });
      return;
    }
    if (customId?.startsWith('submit_review_')) {
      const { handleSubmitReviewSelect } = await import('./handlers/submitReview.js');
      await handleSubmitReviewSelect(interaction, customId);
      return;
    }
    if (customId?.startsWith('invite_ringer_team_')) {
      const { handleInviteRingerTeamSelect } = await import('./handlers/ringers.js');
      await handleInviteRingerTeamSelect(interaction, customId);
      return;
    }
    console.error('Unknown component interaction (button/select):', { customId, fullData: JSON.stringify(data) });
    await interaction.reply({ content: `❌ Unknown button/menu (custom_id: ${customId || '(none)'}). Check Firebase logs.`, ephemeral: true });
    return;
  }
  
  if (type === 2) {
    const commandName = data?.name || interaction.commandName;
    switch (commandName) {
      case 'verify-sr':
        await handleVerifySrSlash(interaction);
        break;
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
      case 'schedule-carryover':
        const { handleScheduleCarryOverSlash } = await import('./handlers/scheduleCarryOver.js');
        await handleScheduleCarryOverSlash(interaction);
        break;
      case 'event-summary':
        const { handleEventSummarySlash } = await import('./handlers/eventSummary.js');
        await handleEventSummarySlash(interaction);
        break;
      case 'my-timezone':
        const { handleMyTimezoneSlash } = await import('./handlers/myTimezone.js');
        await handleMyTimezoneSlash(interaction);
        break;
      case 'invite':
        const { handleInviteSlash } = await import('./handlers/invite.js');
        await handleInviteSlash(interaction);
        break;
      case 'create-team':
        const { handleCreateTeamSlash } = await import('./handlers/createTeam.js');
        await handleCreateTeamSlash(interaction);
        break;
      case 'send-scrim-request':
        const { handleSendScrimRequestSlash } = await import('./handlers/sendScrimRequest.js');
        await handleSendScrimRequestSlash(interaction);
        break;
      case 'drop-scrim':
        const { handleDropScrimSlash } = await import('./handlers/dropScrim.js');
        await handleDropScrimSlash(interaction);
        break;
      case 'add-event':
        const { handleAddEventSlash } = await import('./handlers/calendar.js');
        await handleAddEventSlash(interaction);
        break;
      case 'edit-event':
        const { handleEditEventSlash } = await import('./handlers/calendar.js');
        await handleEditEventSlash(interaction);
        break;
      case 'delete-event':
        const { handleDeleteEventSlash } = await import('./handlers/calendar.js');
        await handleDeleteEventSlash(interaction);
        break;
      case 'find-ringers':
        const { handleFindRingersSlash } = await import('./handlers/ringers.js');
        await handleFindRingersSlash(interaction);
        break;
      case 'edit-profile':
        const { handleEditProfileSlash } = await import('./handlers/editProfile.js');
        await handleEditProfileSlash(interaction);
        break;
      case 'team-settings':
        const { handleTeamSettingsSlash } = await import('./handlers/teamSettings.js');
        await handleTeamSettingsSlash(interaction);
        break;
      case 'submit-review':
        const { handleSubmitReviewSlash } = await import('./handlers/submitReview.js');
        await handleSubmitReviewSlash(interaction);
        break;
      default: {
        const receivedCommand = commandName || data?.name || '(none)';
        console.error('Unknown command received - not implemented in Firebase bot:', {
          commandName: receivedCommand,
          interactionType: type,
          dataKeys: data ? Object.keys(data) : [],
          fullData: JSON.stringify(data),
          hint: 'Add a case for this command in routeInteraction(), or register only supported commands with Discord.',
        });
        await interaction.reply({
          content: `❌ Command \`/${receivedCommand}\` is not supported by this bot. Supported commands: help, my-team, schedule-scrim, find-time, add-player, and more — try \`/help\` for the full list.`,
          ephemeral: true,
        });
      }
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
          dmError: 'Manager Discord account not linked. Please enter your Discord username in the form below to receive a verification DM.',
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
      return;
    }
    
    // Username-based verification: search guilds bot is in, find user, send DM
    if (data.discordUsername) {
      const db = admin.firestore();
      const cleanUsername = String(data.discordUsername).split('#')[0].toLowerCase().trim();
      const guildsSnap = await db.collection('discordBotGuilds').limit(100).get();
      const guildIds = guildsSnap.docs.map((d) => d.id);
      
      if (guildIds.length === 0) {
        await db.collection('discordVerifications').doc(verificationCode).update({
          dmError: 'No Discord servers registered yet. Use any bot command (e.g. /help) in your server first, then try linking again. Or use manual verification: run /verify-discord code:' + verificationCode + ' in Discord.',
          dmSent: false
        });
        return;
      }
      
      let discordUserId = null;
      for (const guildId of guildIds) {
        try {
          const members = await discordApi.searchGuildMembers(guildId, cleanUsername, 5);
          if (Array.isArray(members) && members.length > 0) {
            const match = members.find(
              (m) =>
                m.user?.username?.toLowerCase() === cleanUsername ||
                m.user?.global_name?.toLowerCase() === cleanUsername ||
                m.nick?.toLowerCase() === cleanUsername
            ) || members[0];
            if (match?.user?.id) {
              discordUserId = match.user.id;
              break;
            }
          }
        } catch (err) {
          // Guild might lack Server Members Intent or bot may have left
          continue;
        }
      }
      
      if (!discordUserId) {
        await db.collection('discordVerifications').doc(verificationCode).update({
          dmError: `Could not find Discord user "${cleanUsername}". Make sure you're in a server with the bot and your username matches. Or run /verify-discord code:${verificationCode} in Discord.`,
          dmSent: false
        });
        return;
      }
      
      const { sendVerificationDMToUser } = await import('./handlers/verifyDm.js');
      try {
        await sendVerificationDMToUser(
          discordUserId,
          verificationCode,
          data.userEmail,
          data.userName || data.discordUsername,
          data.teamName,
          data.isInvite === true,
          data.invitedByName || null
        );
        await db.collection('discordVerifications').doc(verificationCode).update({
          dmSent: true,
          dmSentAt: new Date(),
          discordUserId
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

// --- Firestore trigger: create calendar events when scrim request is accepted ---
export const onScrimRequestUpdated = onDocumentUpdated(
  { document: 'scrimRequests/{requestId}' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data();
    if (data.status !== 'accepted') return;
    const beforeData = event.data?.before?.data();
    if (beforeData?.status === 'accepted') return; // Already was accepted

    const slot = data.slot;
    if (!slot?.day || slot?.hour === undefined) return;

    const db = admin.firestore();
    const fromTeamDoc = await db.collection('teams').doc(data.fromTeamId).get();
    const toTeamDoc = await db.collection('teams').doc(data.toTeamId).get();
    if (!fromTeamDoc.exists || !toTeamDoc.exists) return;

    const fromTeam = fromTeamDoc.data();
    const toTeam = toTeamDoc.data();

    let startDate;
    if (slot.scheduledDate) {
      startDate = slot.scheduledDate?.toDate ? slot.scheduledDate.toDate() : new Date(slot.scheduledDate);
    } else {
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDayIndex = daysOfWeek.indexOf(slot.day);
      if (targetDayIndex === -1) return;
      const now = new Date();
      const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
      let daysUntil = targetDayIndex - created.getDay();
      if (daysUntil < 0) daysUntil += 7;
      else if (daysUntil === 0 && created.getHours() > slot.hour) daysUntil += 7;
      startDate = new Date(created);
      startDate.setDate(created.getDate() + daysUntil);
      startDate.setHours(slot.hour, 0, 0, 0);
    }
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    const baseEvent = {
      title: `Scrim vs ${data.fromTeamId === fromTeamDoc.id ? data.toTeamName : data.fromTeamName}`,
      description: null,
      startTime: admin.firestore.Timestamp.fromDate(startDate),
      endTime: admin.firestore.Timestamp.fromDate(endDate),
      recurrenceRule: null,
      eventType: 'scrim',
      reminders: [60, 1440],
      colorEmoji: '⚔️',
      scrimRequestId: event.params.requestId,
      remindersSent: {}
    };

    const createForTeam = async (teamId, team, opponentName) => {
      const existing = await db.collection('calendarEvents')
        .where('teamId', '==', teamId)
        .where('scrimRequestId', '==', event.params.requestId)
        .limit(1)
        .get();
      if (!existing.empty) return;

      await db.collection('calendarEvents').add({
        ...baseEvent,
        title: `Scrim vs ${opponentName}`,
        teamId,
        discordGuildId: team.discordGuildId || null,
        createdBy: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    };

    await createForTeam(data.fromTeamId, fromTeam, data.toTeamName);
    await createForTeam(data.toTeamId, toTeam, data.fromTeamName);
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

// --- Scheduled: weekly schedule carryover reminders (Mondays 00:10 UTC) ---
export const scheduleCarryOverReminders = onSchedule(
  { schedule: '10 0 * * 1', region: 'us-central1' }, // Every Monday at 00:10 UTC
  async () => {
    const db = admin.firestore();
    const { EmbedBuilder } = await import('discord.js');
    const teamsSnapshot = await db.collection('teams').get();

    for (const teamDoc of teamsSnapshot.docs) {
      const team = { id: teamDoc.id, ...teamDoc.data() };
      const schedule = team.schedule || [];
      const scheduleCarryOver = team.scheduleCarryOver !== false;

      if (scheduleCarryOver === false) {
        // Clear schedule at week boundary
        if (schedule.length > 0) {
          await db.collection('teams').doc(team.id).update({ schedule: [] });
        }
        continue;
      }

      if (schedule.length === 0) continue;

      const managers = (team.members || []).filter(
        m => m.discordId && m.roles && (m.roles.includes('Manager') || m.roles.includes('Owner'))
      );

      const slotSummary = schedule.slice(0, 5).map(s => `${s.day} ${(s.hour || 0).toString().padStart(2, '0')}:00`).join(', ');
      const more = schedule.length > 5 ? ` (+${schedule.length - 5} more)` : '';

      const embed = new EmbedBuilder()
        .setTitle('📅 Weekly Schedule Reminder')
        .setDescription(`**${team.name || 'Your team'}** schedule is the same as last week. Change if needed.`)
        .addFields({ name: 'Current slots', value: slotSummary + more, inline: false })
        .setColor(0x5865F2)
        .setFooter({ text: 'Update at Team Management → Availability, or uncheck "Carry schedule to next week" to clear each week.' })
        .setTimestamp();

      for (const manager of managers) {
        try {
          await discordApi.sendDM(manager.discordId, { embeds: [discordApi.embedToApi(embed)] });
        } catch (e) {
          console.log('Could not send schedule reminder to manager:', manager.discordId, e.message);
        }
      }
    }
  }
);

// --- HTTP Handler ---
export const discordInteractions = onRequest(
  { region: 'us-central1', minInstances: 1 },
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
    
    console.log('Received interaction:', {
      method: req.method,
      signature: !!signature,
      timestamp: !!timestamp,
      bodyType: typeof req.body,
      rawBodyExists: !!req.rawBody
    });

    // Parse body FIRST so ping can be responded to before async signature check
    let body;
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
    } catch (e) {
      console.error('Failed to parse body:', e);
      res.status(400).send('Invalid JSON');
      return;
    }

    // verifyKey is async in discord-interactions v4
    const isValid = await verifyKey(rawBody, signature, timestamp, publicKey);
    if (!isValid) {
      console.error('Invalid request signature', { signature, timestamp, publicKeyLength: publicKey?.length });
      res.status(401).send('Invalid request signature');
      return;
    }
    
    // Handle ping
    if (body.type === 1) {
      console.log('Received ping from Discord');
      res.status(200).json({ type: 1 });
      return;
    }
    
    // Register guild ID for later DM-by-username lookups (fire-and-forget)
    if (body.guild_id) {
      admin.firestore().doc(`discordBotGuilds/${body.guild_id}`).set(
        { lastSeen: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      ).catch((e) => console.warn('Failed to register guild:', e.message));
    }
    
    // IMMEDIATELY defer the reply so Discord doesn't timeout
    // Discord requires a response within 3 seconds
    let responseSent = false;
    const sendResponse = (payload) => {
      if (!responseSent) {
        responseSent = true;
        console.log('Sending response to Discord:', JSON.stringify(payload));
        res.status(200).json(payload);
      } else {
        console.log('Response already sent, ignoring payload:', JSON.stringify(payload));
      }
    };
    
    const interaction = createInteractionAdapter(body, sendResponse);

    // Defer immediately for slash commands and buttons - Discord requires response within 3 seconds.
    // Cold starts and dynamic imports can exceed that; deferring first prevents "stuck on thinking".
    if (body.type === 2 || body.type === 3) {
      await interaction.deferReply({ ephemeral: true });
    }
    
    try {
      const routeLabel = body.type === 2
        ? `slash: ${body.data?.name || '(no name)'}`
        : body.data?.custom_id || `type=${body.type}`;
      console.log('Routing interaction:', routeLabel, body.data ? JSON.stringify(body.data) : '');
      await routeInteraction(interaction);
      console.log('Interaction routing complete');
      
      if (!responseSent) {
        const response = interaction._response;
        if (response) {
          sendResponse(response);
        } else {
          sendResponse({ type: 4, data: { content: '✅ Done', flags: 64 } });
        }
      }
    } catch (error) {
      const errMsg = error?.message || String(error);
      const errStack = error?.stack || '';
      console.error('Interaction error:', {
        message: errMsg,
        stack: errStack,
        name: error?.name,
        command: body?.data?.name ?? body?.data?.custom_id ?? '(none)',
        interactionType: body?.type,
      });
      const userMsg = `❌ Error: ${errMsg.substring(0, 1800)}`; // Discord 2000 char limit
      if (!responseSent) {
        sendResponse({ type: 4, data: { content: userMsg, flags: 64 } });
      } else {
        // Response already sent (deferred) - edit the reply so user sees the actual error
        const { interactionEditReply } = await import('./discordApi.js');
        try {
          await interactionEditReply(body.application_id, body.token, { content: userMsg });
        } catch (editErr) {
          console.error('Failed to edit deferred reply with error:', editErr.message);
        }
      }
    }
  }
);
