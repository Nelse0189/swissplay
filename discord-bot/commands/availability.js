import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFirestore } from '../firebase/config.js';
import { getTeamByManagerDiscordId, getPlayerByDiscordId } from '../utils/firebase-helpers.js';

/**
 * Handle availability request command from managers
 * Usage: !request-availability [@player1 @player2 ...] [date] [time]
 *        !request-availability all [date] [time]  (sends to all players)
 */
export async function handleAvailabilityRequest(message, args) {
  const managerDiscordId = message.author.id;
  const db = getFirestore();

  // Get manager's team
  const team = await getTeamByManagerDiscordId(managerDiscordId);
  
  if (!team) {
    message.reply('❌ You are not linked as a manager of any team. Please link your Discord account from the website.');
    return;
  }

  // Parse mentions and arguments
  const mentions = Array.from(message.mentions.users.values());
  const mentionedDiscordIds = mentions.map(u => u.id);
  
  // Check if "all" keyword is used
  const sendToAll = args.includes('all') || mentionedDiscordIds.length === 0;
  
  // Parse time period (skip "all" and mentions)
  let timePeriod = null;
  const periodArgs = args.filter(arg => 
    !arg.startsWith('<@') && 
    !arg.endsWith('>') && 
    arg !== 'all'
  );
  
  if (periodArgs.length >= 1) {
    timePeriod = periodArgs[0];
  }

  // Get all players from the team
  const allTeamPlayers = team.members.filter(m => 
    m.roles && (m.roles.includes('Player') || m.roles.includes('Coach'))
  );

  if (allTeamPlayers.length === 0) {
    message.reply('❌ No players found in your team.');
    return;
  }

  // Filter players with Discord IDs
  let targetPlayers = allTeamPlayers.filter(p => p.discordId);

  if (targetPlayers.length === 0) {
    message.reply('❌ No players have linked their Discord accounts. Players must link their Discord accounts from the website.');
    return;
  }

  // If specific players mentioned, filter to only those players
  if (!sendToAll && mentionedDiscordIds.length > 0) {
    targetPlayers = targetPlayers.filter(p => mentionedDiscordIds.includes(p.discordId));
    
    if (targetPlayers.length === 0) {
      message.reply('❌ None of the mentioned players are linked to your team. They must link their Discord accounts from the website first.');
      return;
    }
    
    // Check if any mentioned users aren't linked
    const unlinkedMentions = mentions.filter(u => 
      !allTeamPlayers.some(p => p.discordId === u.id)
    );
    
    if (unlinkedMentions.length > 0) {
      const unlinkedNames = unlinkedMentions.map(u => u.username).join(', ');
      message.reply(`⚠️  Note: ${unlinkedNames} ${unlinkedMentions.length === 1 ? 'is' : 'are'} not linked to your team. Skipping ${unlinkedMentions.length === 1 ? 'them' : 'them'}.`);
    }
  }

  // Create availability request document
  const requestData = {
    teamId: team.id,
    managerDiscordId,
    managerName: message.author.username,
    timePeriod: timePeriod || null,
    createdAt: new Date(),
    responses: {},
    status: 'pending'
  };

  const requestRef = await db.collection('availabilityRequests').add(requestData);
  const requestId = requestRef.id;

  // Create embed for availability request
  const embed = new EmbedBuilder()
    .setTitle('📅 Availability Request')
    .setDescription('Please respond with your availability for the upcoming scrim.')
    .setColor(0x00ff00)
    .addFields(
      { name: 'Team', value: team.name, inline: true },
      { name: 'Requested by', value: message.author.username, inline: true }
    );

  if (timePeriod) {
    embed.addFields({ name: 'Time Period', value: timePeriod, inline: true });
  }

  embed.addFields({
    name: 'Instructions',
    value: 'Click the buttons below to respond:\n✅ Available\n❌ Unavailable\n⏰ Maybe (with time constraints)'
  });

  // Create buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`avail_yes_${requestId}`)
        .setLabel('✅ Available')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`avail_no_${requestId}`)
        .setLabel('❌ Unavailable')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`avail_maybe_${requestId}`)
        .setLabel('⏰ Maybe')
        .setStyle(ButtonStyle.Secondary)
    );

  // Send DM to each target player
  let successCount = 0;
  let failCount = 0;
  const failedPlayers = [];

  for (const player of targetPlayers) {
    try {
      const discordUser = await message.client.users.fetch(player.discordId);
      await discordUser.send({ embeds: [embed], components: [row] });
      successCount++;
      
      // Store request ID for this player
      message.client.activeRequests.set(requestId, {
        teamId: team.id,
        requestId,
        playerDiscordId: player.discordId,
        playerUid: player.uid
      });
    } catch (error) {
      console.error(`Failed to DM player ${player.discordId}:`, error);
      failCount++;
      failedPlayers.push(player.name || player.discordId);
    }
  }

  // Store button interactions
  const collector = message.channel.createMessageComponentCollector({
    filter: i => i.customId.startsWith('avail_') && i.customId.endsWith(`_${requestId}`),
    time: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  collector.on('collect', async (interaction) => {
    await handleButtonResponse(interaction, requestId, team.id);
  });

  // Confirm to manager
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Availability Request Sent')
    .setDescription(
      sendToAll 
        ? `Sent availability request to all ${successCount} linked player(s)`
        : `Sent availability request to ${successCount} selected player(s)`
    )
    .addFields(
      { name: 'Request ID', value: requestId, inline: true },
      { name: 'Successful', value: `${successCount}`, inline: true },
      { name: 'Failed', value: `${failCount}`, inline: true }
    )
    .setColor(successCount > 0 ? 0x00ff00 : 0xff0000);

  if (failedPlayers.length > 0 && failedPlayers.length <= 5) {
    confirmEmbed.addFields({
      name: 'Failed Players',
      value: failedPlayers.join(', '),
      inline: false
    });
  }

  message.reply({ embeds: [confirmEmbed] });
}

/**
 * Handle button response from players
 */
export async function handleButtonAvailabilityResponse(interaction, requestId, responseType) {
  // Defer immediately - Firestore ops can exceed Discord's 3s timeout (especially on Cloud Run)
  await interaction.deferReply({ ephemeral: true });

  const db = getFirestore();
  const playerDiscordId = interaction.user.id;
  
  // Get request data first to find teamId
  const requestRef = db.collection('availabilityRequests').doc(requestId);
  const requestDoc = await requestRef.get();
  
  if (!requestDoc.exists) {
    await interaction.editReply({ content: '❌ Request not found.' });
    return;
  }

  const requestData = requestDoc.data();
  const teamId = requestData.teamId;
  
  // Get player info
  const player = await getPlayerByDiscordId(playerDiscordId, teamId);
  
  if (!player) {
    await interaction.editReply({ content: '❌ You are not linked to this team.' });
    return;
  }
  
  let responseText = '';
  let responseValue = false;
  
  switch (responseType) {
    case 'yes':
      responseText = '✅ Available';
      responseValue = true;
      break;
    case 'no':
      responseText = '❌ Unavailable';
      responseValue = false;
      break;
    case 'maybe':
      responseText = '⏰ Maybe';
      responseValue = null;
      break;
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

  // Confirm to player (use editReply since we deferred)
  await interaction.editReply({ 
    content: `✅ Response recorded: ${responseText}\n\nIf you selected "Maybe", you can send a follow-up message with your time constraints.`
  });

  // Notify manager
  try {
    const manager = await interaction.client.users.fetch(requestData.managerDiscordId);
    const notifyEmbed = new EmbedBuilder()
      .setTitle('📝 Availability Response')
      .setDescription(`${player.name || interaction.user.username} responded: ${responseText}`)
      .addFields({ name: 'Request ID', value: requestId })
      .setColor(responseValue === true ? 0x00ff00 : responseValue === false ? 0xff0000 : 0xffaa00);
    
    await manager.send({ embeds: [notifyEmbed] });
  } catch (error) {
    console.error('Failed to notify manager:', error);
  }
}

/**
 * Handle button response from players (legacy - kept for collector)
 */
async function handleButtonResponse(interaction, requestId, teamId) {
  const db = getFirestore();
  const playerDiscordId = interaction.user.id;
  
  // Get player info
  const player = await getPlayerByDiscordId(playerDiscordId, teamId);
  
  if (!player) {
    await interaction.reply({ content: '❌ You are not linked to this team.', ephemeral: true });
    return;
  }

  const responseType = interaction.customId.split('_')[1]; // yes, no, or maybe
  
  let responseText = '';
  let responseValue = false;
  
  switch (responseType) {
    case 'yes':
      responseText = '✅ Available';
      responseValue = true;
      break;
    case 'no':
      responseText = '❌ Unavailable';
      responseValue = false;
      break;
    case 'maybe':
      responseText = '⏰ Maybe';
      responseValue = null;
      break;
  }

  // Update request document
  const requestRef = db.collection('availabilityRequests').doc(requestId);
  const requestDoc = await requestRef.get();
  
  if (!requestDoc.exists) {
    await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
    return;
  }

  const requestData = requestDoc.data();
  const responses = requestData.responses || {};
  
  responses[playerDiscordId] = {
    playerName: player.name || interaction.user.username,
    playerUid: player.uid,
    response: responseText,
    responseValue,
    respondedAt: new Date()
  };

  await requestRef.update({ responses });

  // Confirm to player
  await interaction.reply({ 
    content: `✅ Response recorded: ${responseText}\n\nIf you selected "Maybe", you can send a follow-up message with your time constraints.`,
    ephemeral: true 
  });

  // Notify manager (optional - could be improved with a summary channel)
  try {
    const manager = await interaction.client.users.fetch(requestData.managerDiscordId);
    const notifyEmbed = new EmbedBuilder()
      .setTitle('📝 Availability Response')
      .setDescription(`${player.name || interaction.user.username} responded: ${responseText}`)
      .addFields({ name: 'Request ID', value: requestId })
      .setColor(responseValue === true ? 0x00ff00 : responseValue === false ? 0xff0000 : 0xffaa00);
    
    await manager.send({ embeds: [notifyEmbed] });
  } catch (error) {
    console.error('Failed to notify manager:', error);
  }
}

/**
 * Handle text response from players (for "maybe" with details)
 */
export async function handleAvailabilityResponse(message, requestId) {
  const db = getFirestore();
  const playerDiscordId = message.author.id;
  
  const requestRef = db.collection('availabilityRequests').doc(requestId);
  const requestDoc = await requestRef.get();
  
  if (!requestDoc.exists) {
    message.reply('❌ Request not found.');
    return;
  }

  const requestData = requestDoc.data();
  const responses = requestData.responses || {};
  
  if (!responses[playerDiscordId]) {
    message.reply('❌ Please respond using the buttons on the availability request message first.');
    return;
  }

  // Update response with additional details
  responses[playerDiscordId].details = message.content;
  responses[playerDiscordId].updatedAt = new Date();

  await requestRef.update({ responses });
  
  message.reply('✅ Additional details recorded. Thank you!');
}

