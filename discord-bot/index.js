import { Client, GatewayIntentBits, EmbedBuilder, ChannelType, REST, Routes, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from 'discord.js';
import { config } from 'dotenv';
import http from 'http';
import { initializeFirebase, getFirestore } from './firebase/config.js';
import { handleAvailabilityRequest, handleAvailabilityResponse, handleButtonAvailabilityResponse } from './commands/availability.js';
import { handleListPlayers } from './commands/list.js';
import { handleFindFreeAgentsSlash, handleInviteFaSelect, handleInviteFaTeamSelect } from './commands/freeagents.js';
import { handleFindRingersSlash, handleInviteRingerSelect, handleInviteRingerTeamSelect } from './commands/ringers.js';
import { handleEventSummarySlash } from './commands/eventSummary.js';
import { handleMyTimezoneSlash } from './commands/myTimezone.js';
import { handleCreateTeamSlash } from './commands/createTeam.js';
import { handleSendScrimRequestSlash, handleSendScrimSelectMenu } from './commands/sendScrimRequest.js';
import { handleDropScrimSlash, handleDropScrimSelectMenu, handleDropScrimConfirm } from './commands/dropScrim.js';
import { handleAddEventSlash, handleEditEventSlash, handleDeleteEventSlash, handleEditEventSelectMenu, handleDeleteEventSelectMenu, handleDeleteEventConfirm } from './commands/calendar.js';
import { handleEditProfileSlash } from './commands/editProfile.js';
import { handleTeamSettingsSlash } from './commands/teamSettings.js';
import { handleScheduleCarryOverSlash } from './commands/scheduleCarryOver.js';
import { handleSubmitReviewSlash, handleSubmitReviewSelect } from './commands/submitReview.js';
import { parseScrimTimeCSV, isValidScrimTimeCSV } from './utils/scrim-parser.js';
import { sendVerificationDM, sendVerificationDMByUsername, handleVerificationConfirm, handleVerificationDeny } from './commands/verify.js';
import { setupCalendarSyncListener } from './services/calendarSync.js';
import { setupCalendarReminderSystem } from './services/calendarReminders.js';
import { setupNotificationListener } from './services/notificationListener.js';
import { commands } from './commandDefinitions.js';
import { ensureTeamLinkedToGuild } from './utils/firebase-helpers.js';

config();

const SKIP_DISCORD_DMS = process.env.SKIP_DISCORD_DMS === '1' || process.env.SKIP_DISCORD_DMS === 'true';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Required for guild.members.search() to find users when sending DMs
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Store active availability requests
client.activeRequests = new Map();

// Initialize Firebase (with error handling)
try {
  initializeFirebase();
} catch (error) {
  console.error('⚠️  Firebase initialization failed:', error.message);
  console.log('Continuing without Firebase (some features may not work)');
}

// Register slash commands
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    console.log('🔄 Registering slash commands...');

    if (guildId) {
      // Clear guild commands to prevent duplicates
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );
      console.log(`✅ Cleared slash commands for guild ${guildId} to prevent duplicates`);
    }

    // Always register commands globally
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log('✅ Successfully registered slash commands globally (may take up to 1 hour to appear)');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

client.once('clientReady', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📊 Connected to ${client.guilds.cache.size} server(s)`);
  
  // Register slash commands when bot is ready
  await registerCommands();
  
  // Set up Firestore listener for automatic Discord verification DMs
  setupVerificationListener(client, SKIP_DISCORD_DMS);
  
  // Set up Firestore listener for new scrim requests
  setupScrimRequestListener(client, SKIP_DISCORD_DMS);
  
  // Set up reminder system (check every 5 minutes)
  setupScrimReminderSystem(client, SKIP_DISCORD_DMS);

  // Set up Firestore listener for calendar event sync to Discord Scheduled Events
  setupCalendarSyncListener(client);

  // Set up calendar event reminders (15m, 1h, 24h, 1 week before)
  setupCalendarReminderSystem(client, SKIP_DISCORD_DMS);

  // Set up notification listener (DM users on lft_invite, etc.)
  setupNotificationListener(client, SKIP_DISCORD_DMS);
});

/**
 * Set up Firestore listener to automatically send verification DMs when new verifications are created
 */
function setupVerificationListener(client, skipDms = false) {
  try {
    const db = getFirestore();
    if (!db) {
      console.error('❌ Firestore not available, skipping verification listener setup');
      return;
    }
    
    const verificationsRef = db.collection('discordVerifications');
    
    console.log('👂 Setting up Firestore listener for Discord verifications...');
    
    // Listen for new verification documents
    verificationsRef.onSnapshot((snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        if (change.type === 'added') {
          const verificationData = change.doc.data();
          const verificationCode = change.doc.id;
          
          // Process pending verifications
          if (verificationData.status === 'pending' && !verificationData.discordUserId) {
            // Manager verification (from website button) - find by team
            if (verificationData.isManagerVerification && verificationData.teamId && verificationData.userUid) {
              console.log(`📨 Manager verification request detected: ${verificationCode} for team ${verificationData.teamId}`);
              
              setTimeout(async () => {
                try {
                  // Find manager's Discord ID from team
                  const teamDoc = await db.collection('teams').doc(verificationData.teamId).get();
                  if (teamDoc.exists) {
                    const team = teamDoc.data();
                    const manager = team.members?.find(m => m.uid === verificationData.userUid);
                    
                    if (manager?.discordId) {
                      if (skipDms) {
                        console.log(`[SKIP_DMS] Would send verification DM to ${manager.discordId}`);
                        return;
                      }
                      // Manager already has Discord linked, send verification DM
                      await sendVerificationDM(
                        client,
                        manager.discordId,
                        verificationCode,
                        verificationData.userEmail,
                        verificationData.userName,
                        verificationData.teamName,
                        false,
                        null
                      );
                      
                      await verificationsRef.doc(verificationCode).update({
                        dmSent: true,
                        dmSentAt: new Date(),
                        discordUserId: manager.discordId
                      });
                      
                      console.log(`✅ Manager verification DM sent to ${manager.discordId}`);
                    } else {
                      // Manager doesn't have Discord linked yet
                      await verificationsRef.doc(verificationCode).update({
                        dmError: 'Manager Discord account not linked. Please link from the website first.',
                        dmSent: false
                      });
                    }
                  }
                } catch (error) {
                  console.error(`❌ Failed to send manager verification DM:`, error.message);
                  await verificationsRef.doc(verificationCode).update({
                    dmError: error.message,
                    dmSent: false
                  }).catch(() => {});
                }
              }, 1000);
            }
            // Username-based verification (invites/legacy)
            else if (verificationData.discordUsername) {
            const isInvite = verificationData.isInvite === true;
            console.log(`📨 New ${isInvite ? 'invite' : 'verification'} request detected: ${verificationCode} for ${verificationData.discordUsername}`);
            
            if (skipDms) {
              console.log(`[SKIP_DMS] Would send verification DM to ${verificationData.discordUsername}`);
              return;
            }
            // Small delay to ensure document is fully written
            setTimeout(async () => {
              try {
                await sendVerificationDMByUsername(
                  client,
                  verificationData.discordUsername,
                  verificationCode,
                  verificationData.userEmail || null,
                  verificationData.userName || verificationData.discordUsername,
                  verificationData.teamName,
                  isInvite,
                  verificationData.invitedByName || null
                );
                
                // Update verification document to mark DM as sent
                await verificationsRef.doc(verificationCode).update({
                  dmSent: true,
                  dmSentAt: new Date()
                });
                
                console.log(`✅ Verification DM sent to ${verificationData.discordUsername}`);
              } catch (error) {
                console.error(`❌ Failed to send automatic verification DM to ${verificationData.discordUsername}:`, error.message);
                
                // Update verification document with error
                try {
                  await verificationsRef.doc(verificationCode).update({
                    dmError: error.message,
                    dmSent: false
                  });
                } catch (updateError) {
                  console.error('Failed to update verification document:', updateError);
                }
              }
            }, 1000);
            }
          }
        }
      }
    }, (error) => {
      console.error('❌ Error in Firestore verification listener:', error);
      // Don't crash - just log the error
    });
    
    console.log('✅ Firestore listener for Discord verifications is active');
  } catch (error) {
    console.error('❌ Failed to set up Firestore listener:', error);
  }
}

// Handle all interactions (slash commands and buttons)
client.on('interactionCreate', async (interaction) => {
  try {
    // Handle select-menu interactions (team picker for self-linking)
    if (interaction.isStringSelectMenu()) {
      const { customId, values } = interaction;

      if (customId.startsWith('add_player_team_')) {
        await interaction.update({ content: '⏳ Adding player to team...', components: [] });
        
        const sessionCode = customId.replace('add_player_team_', '');
        const selectedTeamId = values?.[0];
        
        try {
          const db = getFirestore();
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
          
          const teamDoc = await db.collection('teams').doc(selectedTeamId).get();
          if (!teamDoc.exists) {
            await interaction.followUp({ content: '❌ Team not found.', ephemeral: true });
            return;
          }
          
          const team = { id: teamDoc.id, ...teamDoc.data() };
          const guildId = interaction.guild?.id;
          if (guildId) await ensureTeamLinkedToGuild(db, team.id, guildId);
          const playerUser = await interaction.client.users.fetch(session.playerId);
          
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
              await sessionRef.delete().catch(() => {});
              return;
            }
            
            // They are on the team but missing the Player role, or roles changed. Update the member array.
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
            
            await sessionRef.delete().catch(() => {});
            
            await interaction.followUp({
              content: `✅ Updated ${session.playerUsername} on **${team.name}**!`,
              ephemeral: true
            });
            return;
          }
          
          await addPlayerToTeam(db, team, playerUser, session.roleStr);
          await sessionRef.delete().catch(() => {});
          
          await interaction.followUp({
            content: `✅ Added ${session.playerUsername} to **${team.name}**!`,
            ephemeral: true
          });
          
        } catch (error) {
          console.error('Error adding player:', error);
          await interaction.followUp({ content: `❌ Failed to add player: ${error.message}`, ephemeral: true });
        }
        return;
      }
      
      if (customId.startsWith('send_scrim_')) {
        const handled = await handleSendScrimSelectMenu(interaction, customId);
        if (handled) return;
      }

      if (customId.startsWith('drop_scrim_')) {
        const handled = await handleDropScrimSelectMenu(interaction, customId);
        if (handled) return;
      }

      if (customId.startsWith('edit_event_')) {
        const handled = await handleEditEventSelectMenu(interaction, customId);
        if (handled) return;
      }

      if (customId.startsWith('delete_event_')) {
        const handled = await handleDeleteEventSelectMenu(interaction, customId);
        if (handled) return;
      }

      if (customId === 'invite_fa_select') {
        const handled = await handleInviteFaSelect(interaction);
        if (handled) return;
      }

      if (customId.startsWith('invite_fa_team_')) {
        const handled = await handleInviteFaTeamSelect(interaction, customId);
        if (handled) return;
      }

      if (customId === 'invite_ringer_select') {
        const handled = await handleInviteRingerSelect(interaction);
        if (handled) return;
      }

      if (customId.startsWith('invite_ringer_team_')) {
        const handled = await handleInviteRingerTeamSelect(interaction, customId);
        if (handled) return;
      }

      if (customId.startsWith('submit_review_')) {
        const handled = await handleSubmitReviewSelect(interaction, customId);
        if (handled) return;
      }

      if (customId.startsWith('schedule_scrim_team_')) {
        await interaction.update({ content: '⏳ Scheduling scrim...', components: [] });
        
        const sessionCode = customId.replace('schedule_scrim_team_', '');
        const selectedTeamId = values?.[0];
        
        try {
          const db = getFirestore();
          const sessionRef = db.collection('scheduleScrimSessions').doc(sessionCode);
          const sessionDoc = await sessionRef.get();
          
          if (!sessionDoc.exists) {
            await interaction.followUp({ content: '❌ Session expired. Please run `/schedule-scrim` again.', ephemeral: true });
            return;
          }
          
          const session = sessionDoc.data();
          if (session.managerId !== interaction.user.id) {
            await interaction.followUp({ content: '❌ This is not your schedule session.', ephemeral: true });
            return;
          }
          
          const teamDoc = await db.collection('teams').doc(selectedTeamId).get();
          if (!teamDoc.exists) {
            await interaction.followUp({ content: '❌ Team not found.', ephemeral: true });
            return;
          }
          
          const team = { id: teamDoc.id, ...teamDoc.data() };
          const guildId = interaction.guild?.id;
          if (guildId) {
            await ensureTeamLinkedToGuild(db, team.id, guildId);
            if (!team.discordGuildId) team.discordGuildId = guildId;
          }
          
          await scheduleScrimForTeam(
            db,
            interaction.client,
            team,
            session.date,
            session.time,
            session.notes || '',
            interaction.user
          );
          
          await sessionRef.delete().catch(() => {});
          
          await interaction.followUp({
            content: `✅ Scrim scheduled for **${team.name}** on **${session.date}** at **${session.time}**!\n\nPolling your team via DM...`,
            ephemeral: true
          });
          
        } catch (error) {
          console.error('Error scheduling scrim:', error);
          await interaction.followUp({ content: `❌ Failed to schedule: ${error.message}`, ephemeral: true });
        }
        return;
      }

      // Unknown select menu - must reply within 3s to avoid "application did not respond"
      try {
        await interaction.reply({ content: '❌ This action is no longer valid or has expired.', ephemeral: true });
      } catch (e) {
        if (!interaction.replied && !interaction.deferred) {
          interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Handle drop scrim confirm
      if (customId.startsWith('drop_confirm_')) {
        const handled = await handleDropScrimConfirm(interaction, customId);
        if (handled) return;
      }

      // Handle drop scrim cancel
      if (customId === 'drop_cancel') {
        await interaction.update({ content: 'Cancelled.', components: [] });
        return;
      }

      // Handle delete event cancel
      if (customId === 'del_event_cancel') {
        await interaction.update({ content: 'Cancelled.', components: [] });
        return;
      }

      // Handle delete event confirm
      if (customId.startsWith('del_event_confirm_')) {
        const handled = await handleDeleteEventConfirm(interaction, customId);
        if (handled) return;
      }

      // Handle LFT invite accept/decline
      if (customId.startsWith('lft_accept_') || customId.startsWith('lft_decline_')) {
        const parts = customId.split('_');
        const action = parts[1]; // accept or decline
        const notifId = parts.slice(2).join('_');
        const db = getFirestore();
        const { getUserByDiscordId } = await import('./utils/firebase-helpers.js');
        try {
          await interaction.deferUpdate();
          const notifDoc = await db.collection('notifications').doc(notifId).get();
          if (!notifDoc.exists) {
            await interaction.editReply({ content: 'Notification no longer exists.', components: [] });
            return;
          }
          const notif = notifDoc.data();
          const userData = await getUserByDiscordId(interaction.user.id);
          if (!userData || notif.userId !== userData.uid) {
            await interaction.editReply({ content: 'Unauthorized.', components: [] });
            return;
          }
          await db.collection('notifications').doc(notifId).update({ read: true });
          const actionData = notif.actionData || {};
          if (action === 'accept') {
            const teamRef = db.collection('teams').doc(actionData.teamId);
            const teamDoc = await teamRef.get();
            if (teamDoc.exists) {
              const team = teamDoc.data();
              const existingMember = team.members?.find(m => m.uid === userData.uid);
              if (!existingMember) {
                const newMember = {
                  uid: userData.uid,
                  name: userData.displayName || userData.username || interaction.user.username,
                  roles: ['Player'],
                  availability: [],
                  discordId: interaction.user.id,
                  discordUsername: interaction.user.username,
                };
                const updatedMembers = [...(team.members || []), newMember];
                const updatedMemberUids = [...(team.memberUids || []), userData.uid];
                await teamRef.update({ members: updatedMembers, memberUids: updatedMemberUids });
              }
            }
            await db.collection('notifications').add({
              userId: actionData.managerId,
              type: 'lft_invite_accepted',
              title: 'Invite Accepted!',
              message: `${userData.displayName || userData.username || 'Player'} has accepted your invite to ${actionData.teamName}.`,
              actionData: { teamId: actionData.teamId },
              read: false,
              createdAt: new Date(),
            });
            await interaction.editReply({ content: '✅ You joined the team!', components: [] });
          } else {
            await db.collection('notifications').add({
              userId: actionData.managerId,
              type: 'lft_invite_declined',
              title: 'Invite Declined',
              message: `${userData.displayName || 'A player'} declined your invite to ${actionData.teamName}.`,
              actionData: { teamId: actionData.teamId },
              read: false,
              createdAt: new Date(),
            });
            await interaction.editReply({ content: 'Invite declined.', components: [] });
          }
        } catch (err) {
          console.error('LFT invite handler error:', err);
          await interaction.editReply({ content: `❌ Error: ${err.message}`, components: [] });
        }
        return;
      }
      
      // Handle scrim request DM response
      if (customId.startsWith('scrimreq_')) {
        const parts = customId.split('_');
        if (parts.length === 3) {
          const action = parts[1]; // accepted, rejected
          const requestId = parts[2];
          
          try {
            // Defer immediately - Firestore ops can exceed Discord's 3s timeout
            await interaction.deferUpdate();
            
            const db = getFirestore();
            const requestRef = db.collection('scrimRequests').doc(requestId);
            const requestDoc = await requestRef.get();
            
            if (!requestDoc.exists) {
              await interaction.editReply({ content: '❌ This request no longer exists or was deleted.', components: [] });
              return;
            }
            
            const requestData = requestDoc.data();
            if (requestData.status !== 'pending') {
              await interaction.editReply({ content: `ℹ️ This request has already been **${requestData.status}**.`, components: [] });
              return;
            }
            
            const respondedAt = new Date();
            
            // Update request status
            await requestRef.update({
              status: action,
              respondedAt: respondedAt
            });
            
            // Replicate updateTeamReliability logic
            if (requestData.toTeamId) {
              try {
                const createdAt = requestData.createdAt?.toDate?.() || new Date(requestData.createdAt);
                const responseHours = (respondedAt - createdAt) / (1000 * 60 * 60);
                let delta = 0;
                if (responseHours < 4) delta = 4;
                else if (responseHours < 24) delta = 2;
                else if (responseHours > 48) delta = -2;
                
                if (delta !== 0) {
                  const teamRef = db.collection('teams').doc(requestData.toTeamId);
                  const teamDoc = await teamRef.get();
                  if (teamDoc.exists) {
                    const current = teamDoc.data().reliabilityScore ?? 100;
                    const next = Math.max(0, Math.min(100, current + delta));
                    await teamRef.update({ reliabilityScore: next });
                  }
                }
                
                // Bonus for picking up a scrim that was dropped within 1h of start
                if (action === 'accepted' && requestData.slot) {
                  const droppedSnapshot = await db.collection('droppedScrims')
                    .where('slotDay', '==', requestData.slot.day)
                    .where('slotHour', '==', requestData.slot.hour)
                    .get();
                    
                  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                  const validDrop = droppedSnapshot.docs.find(d => {
                    const droppedAt = d.data().droppedAt?.toDate?.() || new Date(d.data().droppedAt);
                    return droppedAt > twoHoursAgo;
                  });
                  
                  if (validDrop) {
                    const teamRef = db.collection('teams').doc(requestData.toTeamId);
                    const teamDoc = await teamRef.get();
                    if (teamDoc.exists) {
                      const current = teamDoc.data().reliabilityScore ?? 100;
                      const next = Math.max(0, Math.min(100, current + 5));
                      await teamRef.update({ reliabilityScore: next });
                    }
                    await db.collection('droppedScrims').doc(validDrop.id).delete();
                  }
                }
              } catch (relErr) {
                console.error('Failed to update reliability score via DM:', relErr);
              }
            }
            
            // Edit original message to remove buttons and show result (use editReply since we deferred)
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
              .setColor(action === 'accepted' ? 0x00FF00 : 0xFF0000)
              .addFields({ name: 'Status', value: `✅ You **${action}** this request.` });
              
            await interaction.editReply({ embeds: [embed], components: [] });
            
            // Notify the requesting team's managers (scrim_response)
            const fromTeamId = requestData.fromTeamId;
            if (fromTeamId) {
              try {
                const fromTeamDoc = await db.collection('teams').doc(fromTeamId).get();
                if (fromTeamDoc.exists) {
                  const fromTeam = fromTeamDoc.data();
                  const slotText = requestData.slot?.day && requestData.slot?.hour != null
                    ? `${requestData.slot.day} at ${requestData.slot.hour}:00`
                    : 'your requested slot';
                  const message = `${requestData.toTeamName} has ${action} your scrim request for ${slotText}.`;
                  for (const m of fromTeam.members || []) {
                    if (m.roles?.includes('Manager') || m.roles?.includes('Owner')) {
                      if (m.uid) {
                        await db.collection('notifications').add({
                          userId: m.uid,
                          type: 'scrim_response',
                          title: `Scrim Request ${action.charAt(0).toUpperCase() + action.slice(1)}`,
                          message,
                          actionData: { teamId: fromTeamId, requestId },
                          read: false,
                          createdAt: new Date(),
                        });
                      }
                    }
                  }
                }
              } catch (notifErr) {
                console.error('Failed to notify requesting team:', notifErr);
              }
            }
            
          } catch (error) {
            console.error('Error handling scrim request response:', error);
            try {
              if (interaction.deferred) {
                await interaction.editReply({ content: `❌ An error occurred: ${error.message}`, components: [] });
              } else {
                await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
              }
            } catch (e) {}
          }
        }
        return;
      }
      
      // Handle scrim poll response buttons
      if (customId.startsWith('scrim_')) {
        const parts = customId.split('_');
        if (parts.length === 3) {
          const responseType = parts[1]; // yes, no, maybe
          const pollId = parts[2];
          
          await handleScrimPollResponse(interaction, pollId, responseType);
        }
        return;
      }
      
      // Handle scrim outcome buttons
      if (customId.startsWith('outcome_')) {
        const parts = customId.split('_');
        if (parts.length === 3) {
          const outcome = parts[1]; // win, loss
          const pollId = parts[2];
          
          await handleOutcomeResponse(interaction, pollId, outcome);
        }
        return;
      }
      
      // Handle availability response buttons
      if (customId.startsWith('avail_')) {
        const parts = customId.split('_');
        if (parts.length === 3) {
          const responseType = parts[1]; // yes, no, maybe
          const requestId = parts[2];
          
          await handleButtonAvailabilityResponse(interaction, requestId, responseType);
        }
        return;
      }
      
      // Handle verification buttons
      if (customId.startsWith('verify_confirm_')) {
        const verificationCode = customId.replace('verify_confirm_', '');
        // Guard against empty verification codes
        if (!verificationCode || verificationCode.trim().length === 0) {
          try {
            await interaction.reply({ 
              content: '❌ Invalid verification code. Please re-link from the website.', 
              ephemeral: true 
            });
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
          }
          return;
        }
        try {
          await handleVerificationConfirm(interaction, verificationCode);
        } catch (error) {
          console.error('Error handling verification confirm:', error);
          if (!interaction.replied && !interaction.deferred) {
            try {
              await interaction.reply({ 
                content: '❌ An error occurred processing your confirmation.', 
                ephemeral: true 
              });
            } catch (replyError) {
              console.error('Failed to send error reply:', replyError);
            }
          }
        }
        return;
      }
      
      if (customId.startsWith('verify_deny_')) {
        const verificationCode = customId.replace('verify_deny_', '');
        // Guard against empty verification codes
        if (!verificationCode || verificationCode.trim().length === 0) {
          try {
            await interaction.reply({ 
              content: '❌ Invalid verification code. Please re-link from the website.', 
              ephemeral: true 
            });
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
          }
          return;
        }
        try {
          await handleVerificationDeny(interaction, verificationCode);
        } catch (error) {
          console.error('Error handling verification deny:', error);
          if (!interaction.replied && !interaction.deferred) {
            try {
              await interaction.reply({ 
                content: '❌ An error occurred processing your denial.', 
                ephemeral: true 
              });
            } catch (replyError) {
              console.error('Failed to send error reply:', replyError);
            }
          }
        }
        return;
      }

      // Unknown button - must reply within 3s to avoid "application did not respond"
      try {
        await interaction.reply({ content: '❌ This action is no longer valid or has expired.', ephemeral: true });
      } catch (e) {
        if (!interaction.replied && !interaction.deferred) {
          interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // Handle slash commands
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    switch (commandName) {
      case 'request-availability':
        await handleAvailabilityRequestSlash(interaction);
        break;
      
      case 'list-players':
        await handleListPlayersSlash(interaction);
        break;
      
      case 'help':
        await handleHelpSlash(interaction);
        break;
      
      case 'verify-discord':
        await handleVerifyDiscordSlash(interaction);
        break;
      
      case 'upload-scrim':
        await handleUploadScrimSlash(interaction);
        break;
      
      case 'my-availability':
        await handleMyAvailabilitySlash(interaction);
        break;
      
      case 'my-team':
        await handleMyTeamSlash(interaction);
        break;
      
      case 'verify-sr':
        await handleVerifySrSlash(interaction);
        break;
      case 'add-player':
        await handleAddPlayerSlash(interaction);
        break;
      
      case 'remove-player':
        await handleRemovePlayerSlash(interaction);
        break;
      
      case 'schedule-scrim':
        await handleScheduleScrimSlash(interaction);
        break;
      
      case 'find-time':
        await handleFindTimeSlash(interaction);
        break;
      
      case 'team-stats':
        await handleTeamStatsSlash(interaction);
        break;
      
      case 'upcoming-scrims':
        await handleUpcomingScrimsSlash(interaction);
        break;

      case 'event-summary':
        await handleEventSummarySlash(interaction);
        break;

      case 'my-timezone':
        await handleMyTimezoneSlash(interaction);
        break;

      case 'find-free-agents':
        await handleFindFreeAgentsSlash(interaction);
        break;

      case 'find-ringers':
        await handleFindRingersSlash(interaction);
        break;
      
      case 'create-team':
        await handleCreateTeamSlash(interaction);
        break;

      case 'send-scrim-request':
        await handleSendScrimRequestSlash(interaction);
        break;

      case 'drop-scrim':
        await handleDropScrimSlash(interaction);
        break;

      case 'add-event':
        await handleAddEventSlash(interaction);
        break;

      case 'edit-event':
        await handleEditEventSlash(interaction);
        break;

      case 'delete-event':
        await handleDeleteEventSlash(interaction);
        break;

      case 'edit-profile':
        await handleEditProfileSlash(interaction);
        break;

      case 'team-settings':
        await handleTeamSettingsSlash(interaction);
        break;

      case 'schedule-carryover':
        await handleScheduleCarryOverSlash(interaction);
        break;

      case 'submit-review':
        await handleSubmitReviewSlash(interaction);
        break;
      
      case 'invite':
        await handleInviteSlash(interaction);
        break;

      default:
        await interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    const errorMessage = error.message || 'An unknown error occurred';
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `❌ An error occurred: ${errorMessage}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ An error occurred: ${errorMessage}`, ephemeral: true });
      }
    } catch (replyError) {
      console.error('Failed to send error message to user:', replyError);
    }
  }
});

// Handle DMs (for availability request follow-ups)
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Handle DMs separately
  if (message.channel.type === ChannelType.DM) {
    await handleDM(message);
  }
});

async function handleDM(message) {
  const db = getFirestore();
  const userId = message.author.id;
  
  // Check if user has a pending availability update
  try {
    const pendingRef = db.collection('pendingAvailabilityUpdates').doc(userId);
    const pendingDoc = await pendingRef.get();
    
    if (pendingDoc.exists) {
      const pending = pendingDoc.data();
      
      // Check expiry (30 minutes)
      const expiresAt = pending.expiresAt?.toDate();
      if (expiresAt && Date.now() > expiresAt.getTime()) {
        await pendingRef.delete();
      } else {
        // Parse availability from message
        await handleAvailabilityInput(message, pending);
        return;
      }
    }
  } catch (error) {
    console.error('Error checking pending availability:', error);
  }
  
  // Check if this is a response to an availability request
  const requestId = message.content.trim();
  
  // Check if it's a button response (availability request ID)
  if (client.activeRequests.has(requestId)) {
    await handleAvailabilityResponse(message, requestId);
    return;
  }

  // Check if message contains availability data format
  // Format: "Monday-0, Monday-1, Tuesday-14" etc.
  const availabilityPattern = /([A-Za-z]+-\d+)/g;
  const matches = message.content.match(availabilityPattern);
  
  if (matches && matches.length > 0) {
    // Try to find active request by checking recent messages
    // This is a fallback if button interaction didn't work
    message.reply('📝 Please use the buttons from the availability request message to respond.');
    return;
  }

  // Generic DM response
  if (message.content.toLowerCase().includes('help')) {
    const helpEmbed = new EmbedBuilder()
      .setTitle('🤖 SwissPlay Bot Help')
      .setDescription('I help manage team availability for scrims!')
      .addFields(
        { name: '📋 Set Your Availability', value: 'Use `/my-availability` to set when you can play.' },
        { name: '👥 View Your Team', value: 'Use `/my-team` to see your team roster and schedule.' },
        { name: '🔗 Linking Your Account', value: 'Ask your manager to add you using `/add-player` in the server.' }
      )
      .setColor(0x00ff00);
    
    message.reply({ embeds: [helpEmbed] });
  } else {
    // Friendly response for unrecognized DM
    message.reply('👋 Hi! Use `/my-availability` to set your schedule, or type "help" for more commands.');
  }
}

async function handleAvailabilityInput(message, pending) {
  const db = getFirestore();
  const input = message.content.toLowerCase().trim();
  
  // Parse availability from natural language
  const parsed = parseAvailabilityText(input);
  
  if (!parsed || parsed.length === 0) {
    await message.reply(
      '❌ I couldn\'t understand that availability format.\n\n' +
      '**Try formats like:**\n' +
      '• "Weekdays 6-10pm"\n' +
      '• "Monday Wednesday Friday 7-9pm"\n' +
      '• "Weekends anytime"\n' +
      '• "Tuesday Thursday 8-11pm"'
    );
    return;
  }
  
  // Update all teams
  for (const teamId of pending.teamIds) {
    try {
      const teamRef = db.collection('teams').doc(teamId);
      const teamDoc = await teamRef.get();
      
      if (!teamDoc.exists) continue;
      
      const team = { id: teamDoc.id, ...teamDoc.data() };
      const memberIndex = team.members.findIndex(m => m.discordId === message.author.id);
      
      if (memberIndex === -1) continue;
      
      const updatedMembers = [...team.members];
      updatedMembers[memberIndex] = {
        ...updatedMembers[memberIndex],
        availability: parsed,
        availabilityText: message.content.trim()
      };
      
      await teamRef.update({ members: updatedMembers });
    } catch (error) {
      console.error(`Error updating team ${teamId}:`, error);
    }
  }
  
  // Delete pending update
  await db.collection('pendingAvailabilityUpdates').doc(message.author.id).delete();
  
  const embed = new EmbedBuilder()
    .setTitle('✅ Availability Updated!')
    .setDescription(`Your availability: **${message.content.trim()}**`)
    .addFields({ name: 'Updated for', value: `${pending.teamIds.length} team(s)`, inline: true })
    .setColor(0x00ff00)
    .setFooter({ text: 'Your manager can now see your availability.' });
  
  await message.reply({ embeds: [embed] });
}

function parseAvailabilityText(text) {
  // Simple parser for common availability patterns
  const slots = [];
  const lowerText = text.toLowerCase();
  
  // Day mapping
  const dayMap = {
    'monday': 'Monday', 'mon': 'Monday',
    'tuesday': 'Tuesday', 'tue': 'Tuesday', 'tues': 'Tuesday',
    'wednesday': 'Wednesday', 'wed': 'Wednesday',
    'thursday': 'Thursday', 'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday',
    'friday': 'Friday', 'fri': 'Friday',
    'saturday': 'Saturday', 'sat': 'Saturday',
    'sunday': 'Sunday', 'sun': 'Sunday'
  };
  
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const weekends = ['Saturday', 'Sunday'];
  
  let targetDays = [];
  
  // Check for "weekdays" or "weekends"
  if (lowerText.includes('weekday')) {
    targetDays = weekdays;
  } else if (lowerText.includes('weekend')) {
    targetDays = weekends;
  } else if (lowerText.includes('anytime') || lowerText.includes('any time') || lowerText.includes('always')) {
    targetDays = allDays;
  } else {
    // Look for specific days
    for (const [key, day] of Object.entries(dayMap)) {
      if (lowerText.includes(key)) {
        if (!targetDays.includes(day)) targetDays.push(day);
      }
    }
  }
  
  // If no days found, default to all days
  if (targetDays.length === 0) {
    targetDays = allDays;
  }
  
  // Parse time range (e.g., "6-10pm", "18:00-22:00", "after 6pm")
  let startHour = 18; // Default 6pm
  let endHour = 22;   // Default 10pm
  
  // Match patterns like "6-10pm", "6pm-10pm", "18:00-22:00"
  const timeRangeMatch = lowerText.match(/(\d{1,2})(?::00)?(?:am|pm)?\s*-\s*(\d{1,2})(?::00)?(?:am|pm)?/);
  if (timeRangeMatch) {
    startHour = parseInt(timeRangeMatch[1]);
    endHour = parseInt(timeRangeMatch[2]);
    
    // Handle PM conversion
    if (lowerText.includes('pm') && startHour < 12) startHour += 12;
    if (lowerText.includes('pm') && endHour < 12) endHour += 12;
  } else {
    // Match "after 6pm" or "after 18:00"
    const afterMatch = lowerText.match(/after\s+(\d{1,2})(?::00)?(?:am|pm)?/);
    if (afterMatch) {
      startHour = parseInt(afterMatch[1]);
      if (lowerText.includes('pm') && startHour < 12) startHour += 12;
      endHour = 23; // Until 11pm
    }
    
    // Match "until 10pm" or "before 10pm"
    const untilMatch = lowerText.match(/(?:until|before)\s+(\d{1,2})(?::00)?(?:am|pm)?/);
    if (untilMatch) {
      endHour = parseInt(untilMatch[1]);
      if (lowerText.includes('pm') && endHour < 12) endHour += 12;
      startHour = 18; // Default start
    }
    
    // "anytime" means all day
    if (lowerText.includes('anytime') || lowerText.includes('any time')) {
      startHour = 0;
      endHour = 23;
    }
  }
  
  // Create availability slots
  for (const day of targetDays) {
    slots.push({ day, startHour, endHour });
  }
  
  return slots;
}

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

async function handleAddPlayerSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const db = getFirestore();
    const managerDiscordId = interaction.user.id;
    const playerUser = interaction.options.getUser('player');
    const roleStr = interaction.options.getString('role');
    
    if (!playerUser) {
      await interaction.followUp({ content: '❌ Please specify a player to add.', ephemeral: true });
      return;
    }
    
    // Check if user is a verified manager
    const managerTeams = await getManagerTeams(db, managerDiscordId);
    
    if (managerTeams.length === 0) {
      await interaction.followUp({
        content: '❌ You are not a verified manager.\n\nPlease verify your Discord account on the website first (Team Management → Settings → "Verify Discord" button).',
        ephemeral: true
      });
      return;
    }
    
    // Check if player is already on any team in this guild
    const guildId = interaction.guild?.id;
    if (!guildId) {
      await interaction.followUp({ content: '❌ This command must be run in a server, not DMs.', ephemeral: true });
      return;
    }
    
    const allTeams = await db.collection('teams').where('discordGuildId', '==', guildId).get();
    const playerExistingTeam = allTeams.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .find(t => t.members && t.members.some(m => m.discordId === playerUser.id));
    
    if (playerExistingTeam) {
      const isManagerTeam = managerTeams.some(t => t.id === playerExistingTeam.id);
      
      if (isManagerTeam) {
        const memberIndex = playerExistingTeam.members.findIndex(m => m.discordId === playerUser.id);
        const member = playerExistingTeam.members[memberIndex];
        
        if (member.roles?.includes('Player')) {
          await interaction.followUp({
            content: `❌ ${playerUser.username} is already a Player on **${playerExistingTeam.name}**.`,
            ephemeral: true
          });
          return;
        }
        
        // They are on the team but missing the Player role. Update the member array.
        const updatedMembers = [...playerExistingTeam.members];
        const roles = member.roles || [];
        updatedMembers[memberIndex] = {
          ...member,
          roles: [...roles, 'Player']
        };
        
        await db.collection('teams').doc(playerExistingTeam.id).update({
          members: updatedMembers
        });
        
        await interaction.followUp({
          content: `✅ Added the Player role to ${playerUser.username} on **${playerExistingTeam.name}**!\n\nThey can now use \`/my-availability\` and \`/my-team\` to see their team info.`,
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
    
    // If manager has only one team, add to it directly
    if (managerTeams.length === 1) {
      const existingMemberIndex = managerTeams[0].members.findIndex(m => m.discordId === playerUser.id);
      
      if (existingMemberIndex !== -1) {
        const member = managerTeams[0].members[existingMemberIndex];
        const playerRoles = roleStr ? roleStr.split(',').map(r => r.trim()) : [];
        
        if (member.roles?.includes('Player') && (playerRoles.length === 0 || JSON.stringify(member.playerRoles) === JSON.stringify(playerRoles))) {
          await interaction.followUp({
            content: `❌ ${playerUser.username} is already a Player on **${managerTeams[0].name}** with this role.`,
            ephemeral: true
          });
          return;
        }
        
        // They are on the team but missing the Player role, or roles changed. Update the member array.
        const updatedMembers = [...managerTeams[0].members];
        const roles = member.roles || [];
        updatedMembers[existingMemberIndex] = {
          ...member,
          roles: roles.includes('Player') ? roles : [...roles, 'Player'],
          playerRoles: playerRoles.length > 0 ? playerRoles : (member.playerRoles || [])
        };
        
        await db.collection('teams').doc(managerTeams[0].id).update({
          members: updatedMembers
        });
        
        await interaction.followUp({
          content: `✅ Updated ${playerUser.username} on **${managerTeams[0].name}**!\n\nThey can now use \`/my-availability\` and \`/my-team\` to see their team info.`,
          ephemeral: true
        });
        
        return;
      }
      
      await addPlayerToTeam(db, managerTeams[0], playerUser, roleStr);
      await interaction.followUp({
        content: `✅ Added ${playerUser.username} to **${managerTeams[0].name}** as a Player!\n\nThey can now use \`/my-availability\` and \`/my-team\` to see their team info.`,
        ephemeral: true
      });
      
      return;
    }
    
    // Manager has multiple teams - show picker
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
      .addOptions(
        managerTeams.slice(0, 25).map(t => ({
          label: t.name?.slice(0, 100) || t.id,
          value: t.id
        }))
      );
    
    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.followUp({
      content: `Select which team to add **${playerUser.username}** to:`,
      components: [row],
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error in handleAddPlayerSlash:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleRemovePlayerSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const db = getFirestore();
    const managerDiscordId = interaction.user.id;
    const playerUser = interaction.options.getUser('player');
    
    if (!playerUser) {
      await interaction.followUp({ content: '❌ Please specify a player to remove.', ephemeral: true });
      return;
    }
    
    // Check if user is a verified manager
    const managerTeams = await getManagerTeams(db, managerDiscordId);
    
    if (managerTeams.length === 0) {
      await interaction.followUp({
        content: '❌ You are not a verified manager. Please verify on the website first.',
        ephemeral: true
      });
      return;
    }
    
    // Find which team the player is on (among manager's teams)
    const playerTeam = managerTeams.find(t => 
      t.members && t.members.some(m => m.discordId === playerUser.id)
    );
    
    if (!playerTeam) {
      await interaction.followUp({
        content: `❌ ${playerUser.username} is not on any of your teams.`,
        ephemeral: true
      });
      return;
    }
    
    const guildId = interaction.guild?.id;
    if (guildId) await ensureTeamLinkedToGuild(db, playerTeam.id, guildId);
    
    // Prevent removing the last owner
    const player = playerTeam.members.find(m => m.discordId === playerUser.id);
    if (player?.roles?.includes('Owner')) {
      const ownerCount = playerTeam.members.filter(m => m.roles?.includes('Owner')).length;
      if (ownerCount <= 1) {
        await interaction.followUp({
          content: '❌ Cannot remove the last owner. Transfer ownership first or delete the team.',
          ephemeral: true
        });
        return;
      }
    }

    // Remove player
    const updatedMembers = playerTeam.members.filter(m => m.discordId !== playerUser.id);
    
    // Also remove from managerDiscordIds if they were a manager
    let managerDiscordIds = playerTeam.managerDiscordIds || [];
    managerDiscordIds = managerDiscordIds.filter(id => id !== playerUser.id);
    
    await db.collection('teams').doc(playerTeam.id).update({
      members: updatedMembers,
      managerDiscordIds
    });
    
    await interaction.followUp({
      content: `✅ Removed ${playerUser.username} from **${playerTeam.name}**.`,
      ephemeral: true
    });
    
    // Notify player
    try {
      await playerUser.send(`You've been removed from **${playerTeam.name}** by ${interaction.user.username}.`);
    } catch (dmError) {
      console.log(`Could not DM ${playerUser.username}:`, dmError.message);
    }
    
  } catch (error) {
    console.error('Error in handleRemovePlayerSlash:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleScheduleScrimSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const db = getFirestore();
    const managerDiscordId = interaction.user.id;
    const dateStr = interaction.options.getString('date');
    const timeStr = interaction.options.getString('time');
    const notes = interaction.options.getString('notes') || '';
    
    // Check if user is a verified manager
    const managerTeams = await getManagerTeams(db, managerDiscordId);
    
    if (managerTeams.length === 0) {
      await interaction.followUp({
        content: '❌ You are not a verified manager. Please verify on the website first.',
        ephemeral: true
      });
      return;
    }
    
    // Parse date (support "tomorrow", "monday", "2024-03-15")
    const scrimDate = parseFlexibleDate(dateStr);
    const scrimTime = parseFlexibleTime(timeStr);
    
    if (!scrimDate || !scrimTime) {
      await interaction.followUp({
        content: '❌ Invalid date or time format.\n\n**Examples:**\n• Date: "tomorrow", "monday", "2024-03-15"\n• Time: "7pm", "19:00", "7:30pm"',
        ephemeral: true
      });
      return;
    }
    
    // If multiple teams, ask which one
    if (managerTeams.length > 1) {
      const sessionCode = Math.random().toString(36).slice(2, 10);
      await db.collection('scheduleScrimSessions').doc(sessionCode).set({
        managerId: managerDiscordId,
        guildId: interaction.guild?.id,
        teamIds: managerTeams.map(t => t.id),
        date: scrimDate,
        time: scrimTime,
        notes,
        createdAt: new Date()
      });
      
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`schedule_scrim_team_${sessionCode}`)
        .setPlaceholder('Choose which team this scrim is for')
        .addOptions(
          managerTeams.slice(0, 25).map(t => ({
            label: t.name?.slice(0, 100) || t.id,
            value: t.id
          }))
        );
      
      const row = new ActionRowBuilder().addComponents(menu);
      await interaction.followUp({
        content: `Select which team to schedule the scrim for:\n📅 **${scrimDate}** at **${scrimTime}**`,
        components: [row],
        ephemeral: true
      });
      return;
    }
    
    // Single team - schedule directly
    const guildId = interaction.guild?.id;
    if (guildId) {
      await ensureTeamLinkedToGuild(db, managerTeams[0].id, guildId);
      if (!managerTeams[0].discordGuildId) managerTeams[0].discordGuildId = guildId;
    }
    await scheduleScrimForTeam(db, interaction.client, managerTeams[0], scrimDate, scrimTime, notes, interaction.user);
    
    await interaction.followUp({
      content: `✅ Scrim scheduled for **${scrimDate}** at **${scrimTime}**!\n\nPolling your team members via DM...`,
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error in handleScheduleScrimSlash:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleFindTimeSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const db = getFirestore();
    const managerDiscordId = interaction.user.id;
    const period = interaction.options.getString('period') || 'week';
    
    // Check if user is a verified manager
    const managerTeams = await getManagerTeams(db, managerDiscordId);
    
    if (managerTeams.length === 0) {
      await interaction.followUp({
        content: '❌ You are not a verified manager. Please verify on the website first.',
        ephemeral: true
      });
      return;
    }
    
    // Use first team (or we could add team picker)
    const team = managerTeams[0];
    const guildId = interaction.guild?.id;
    if (guildId) await ensureTeamLinkedToGuild(db, team.id, guildId);
    
    // Analyze availability
    const bestTimes = analyzeBestTimes(team, period);
    
    if (bestTimes.length === 0) {
      await interaction.followUp({
        content: '❌ No common availability found. Ask your players to set their availability using `/my-availability`.',
        ephemeral: true
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`📊 Best Times for ${team.name}`)
      .setDescription(`Analysis for: **${getPeriodDescription(period)}**\n\nTop times with most player availability:`)
      .setColor(0x7289da);
    
    bestTimes.slice(0, 5).forEach((slot, i) => {
      const percentage = ((slot.availableCount / team.members.length) * 100).toFixed(0);
      embed.addFields({
        name: `${i + 1}. ${slot.day} ${slot.startHour}:00 - ${slot.endHour}:00`,
        value: `${slot.availableCount}/${team.members.length} players (${percentage}%)`,
        inline: false
      });
    });
    
    embed.setFooter({ text: 'Use /schedule-scrim to schedule a scrim at one of these times!' });
    
    await interaction.followUp({ embeds: [embed], ephemeral: true });
    
  } catch (error) {
    console.error('Error in handleFindTimeSlash:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function getManagerTeams(db, discordId) {
  try {
    const teamMap = new Map();
    const discordIdStr = String(discordId);

    // 1. Teams where this Discord ID is in managerDiscordIds
    const byManagerDiscord = await db.collection('teams')
      .where('managerDiscordIds', 'array-contains', discordIdStr)
      .get();
    byManagerDiscord.docs.forEach(d => teamMap.set(d.id, { id: d.id, ...d.data() }));

    // 2. Teams where user is owner (lookup Firebase UID(s) from users by discordId)
    // Query all matching user docs — same Discord ID can be linked to multiple Firebase accounts
    let usersSnapshot = await db.collection('users').where('discordId', '==', discordIdStr).get();
    if (usersSnapshot.empty && discordId !== discordIdStr) {
      usersSnapshot = await db.collection('users').where('discordId', '==', discordId).get();
    }
    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const byOwner = await db.collection('teams').where('ownerId', '==', uid).get();
      for (const d of byOwner.docs) {
        const team = { id: d.id, ...d.data() };
        teamMap.set(d.id, team);
        // Backfill managerDiscordIds so future lookups are fast
        const mids = team.managerDiscordIds || [];
        if (!mids.some(id => String(id) === discordIdStr)) {
          db.collection('teams').doc(d.id).update({
            managerDiscordIds: [...mids, discordIdStr]
          }).catch(() => {});
        }
      }
    }

    return Array.from(teamMap.values());
  } catch (error) {
    console.error('Error getting manager teams:', error);
    return [];
  }
}

async function addPlayerToTeam(db, team, user, playerRolesStr) {
  const playerRoles = playerRolesStr ? playerRolesStr.split(',').map(r => r.trim()) : [];
  
  // Check if player already exists
  const existingMemberIndex = team.members.findIndex(m => m.discordId === user.id);
  
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
  
  const updatedMembers = [...team.members, newMember];
  
  await db.collection('teams').doc(team.id).update({
    members: updatedMembers
  });
}

async function scheduleScrimForTeam(db, client, team, date, time, notes, managerUser) {
  // Create scrim poll document
  const pollRef = await db.collection('scrimPolls').add({
    teamId: team.id,
    teamName: team.name,
    managerId: managerUser.id,
    managerUsername: managerUser.username,
    date,
    time,
    notes,
    responses: {},
    createdAt: new Date(),
    status: 'active'
  });
  
  const pollId = pollRef.id;

  // Create Discord Scheduled Event (appears in server's Events tab) if team has linked server
  if (team.discordGuildId) {
    try {
      const guild = client.guilds.cache.get(team.discordGuildId)
        || await client.guilds.fetch(team.discordGuildId).catch(() => null);
      if (guild) {
        const [y, m, d] = date.split('-').map(Number);
        const [hr, min] = (time || '19:00').split(':').map(n => parseInt(n, 10) || 0);
        const startTime = new Date(y, (m || 1) - 1, d || 1, hr || 19, min || 0, 0, 0);
        const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
        const scheduledEvent = await guild.scheduledEvents.create({
          name: `⚔️ Scrim – ${team.name}`.substring(0, 100),
          description: (notes ? `Scrim for ${team.name}\n\n${notes}` : `Scrim for ${team.name}. Check your DMs for the availability poll.`).substring(0, 1000),
          scheduledStartTime: startTime,
          scheduledEndTime: endTime,
          entityType: GuildScheduledEventEntityType.External,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
          entityMetadata: { location: team.name.substring(0, 100) }
        });
        await db.collection('scrimPolls').doc(pollId).update({
          discordEventId: scheduledEvent.id,
          updatedAt: new Date()
        });
        console.log(`✅ Created Discord Scheduled Event: ${scheduledEvent.name} (${scheduledEvent.id})`);
      }
    } catch (error) {
      console.warn('Could not create Discord Scheduled Event (need Manage Events?):', error.message);
    }
  }

  // Send DM to each team member
  const members = team.members.filter(m => m.discordId);
  let successCount = 0;
  
  for (const member of members) {
    try {
      const user = await client.users.fetch(member.discordId);
      
      const embed = new EmbedBuilder()
        .setTitle('📅 Scrim Scheduled!')
        .setDescription(`${managerUser.username} scheduled a scrim for **${team.name}**`)
        .addFields(
          { name: 'Date', value: date, inline: true },
          { name: 'Time', value: time, inline: true }
        )
        .setColor(0x7289da);
      
      if (notes) {
        embed.addFields({ name: 'Notes', value: notes, inline: false });
      }
      
      embed.addFields({
        name: 'Can you make it?',
        value: 'Click a button below to respond:'
      });
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`scrim_yes_${pollId}`)
            .setLabel('✅ Yes')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`scrim_no_${pollId}`)
            .setLabel('❌ No')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`scrim_maybe_${pollId}`)
            .setLabel('⏰ Maybe')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await user.send({ embeds: [embed], components: [row] });
      successCount++;
    } catch (error) {
      console.error(`Failed to DM ${member.discordId}:`, error.message);
    }
  }
  
  // Send summary to manager
  try {
    const summaryEmbed = new EmbedBuilder()
      .setTitle('✅ Scrim Poll Sent')
      .setDescription(`Sent availability poll to ${successCount}/${members.length} team members`)
      .addFields(
        { name: 'Date', value: date, inline: true },
        { name: 'Time', value: time, inline: true },
        { name: 'Poll ID', value: pollId, inline: false }
      )
      .setColor(0x00ff00)
      .setFooter({ text: 'You\'ll receive DMs as players respond.' });
    
    await managerUser.send({ embeds: [summaryEmbed] });
  } catch (error) {
    console.log('Could not DM manager:', error.message);
  }
}

function parseFlexibleDate(dateStr) {
  const lower = dateStr.toLowerCase().trim();
  const now = new Date();
  
  if (lower === 'today') {
    return now.toISOString().split('T')[0];
  }
  
  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Day names (e.g., "monday")
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.indexOf(lower);
  
  if (dayIndex !== -1) {
    const target = new Date(now);
    const currentDay = target.getDay();
    let daysToAdd = dayIndex - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence
    target.setDate(target.getDate() + daysToAdd);
    return target.toISOString().split('T')[0];
  }
  
  // ISO date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  return null;
}

function parseFlexibleTime(timeStr) {
  const lower = timeStr.toLowerCase().trim();
  
  // Match "7pm", "7:30pm", "19:00", "19:30"
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?(?:am|pm)?/);
  if (!timeMatch) return null;
  
  let hour = parseInt(timeMatch[1]);
  const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
  
  // Handle AM/PM
  if (lower.includes('pm') && hour < 12) {
    hour += 12;
  } else if (lower.includes('am') && hour === 12) {
    hour = 0;
  }
  
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function analyzeBestTimes(team, period) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 25 }, (_, i) => i); // 0-24
  
  const slots = [];
  
  // For each day and hour, count how many players are available
  for (const day of days) {
    for (const hour of hours) {
      if (hour < 0 || hour > 24) continue; // Only check reasonable scrim hours
      
      let availableCount = 0;
      
      for (const member of team.members) {
        if (!Array.isArray(member.availability)) continue;
        
        const isAvailable = member.availability.some(slot => 
          slot.day === day && 
          hour >= slot.startHour && 
          hour < slot.endHour
        );
        
        if (isAvailable) availableCount++;
      }
      
      if (availableCount > 0) {
        slots.push({
          day,
          startHour: hour,
          endHour: hour + 2, // 2-hour window
          availableCount
        });
      }
    }
  }
  
  // Sort by availability count (descending)
  slots.sort((a, b) => b.availableCount - a.availableCount);
  
  return slots;
}

function getPeriodDescription(period) {
  switch (period) {
    case 'week': return 'Next 7 days';
    case 'two-weeks': return 'Next 14 days';
    case 'this-week': return 'This week';
    default: return 'Next 7 days';
  }
}

/**
 * Set up Firestore listener to notify managers of new scrim requests
 */
function setupScrimRequestListener(client, skipDms = false) {
  try {
    const db = getFirestore();
    if (!db) {
      console.error('❌ Firestore not available, skipping scrim request listener setup');
      return;
    }
    
    const requestsRef = db.collection('scrimRequests');
    console.log('👂 Setting up Firestore listener for Scrim Requests...');
    
    // Listen for new scrim requests
    requestsRef.onSnapshot(async (snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        if (change.type === 'added') {
          const requestData = change.doc.data();
          const requestId = change.doc.id;
          
          if (requestData.status === 'pending' && !requestData.discordDMSent) {
            console.log(`📨 New scrim request detected: ${requestId} from ${requestData.fromTeamName} to ${requestData.toTeamName}`);
            if (skipDms) {
              console.log(`[SKIP_DMS] Would send scrim request DM to managers of ${requestData.toTeamName}`);
              continue;
            }
            setTimeout(async () => {
              try {
                // Find target team to get manager
                const teamDoc = await db.collection('teams').doc(requestData.toTeamId).get();
                if (teamDoc.exists) {
                  const team = teamDoc.data();
                  
                  // Find all managers with a discord ID
                  const managerDiscordIds = team.members
                    ?.filter(m => m.discordId && m.roles && (m.roles.includes('Manager') || m.roles.includes('Owner')))
                    .map(m => m.discordId) || [];
                    
                  if (managerDiscordIds.length > 0) {
                    let sentCount = 0;
                    
                    // Format the date/time nicely
                    const slotDay = requestData.slot?.day || 'Unknown day';
                    const slotHour = requestData.slot?.hour !== undefined ? `${requestData.slot.hour}:00` : 'Unknown time';
                    let scheduledDateStr = '';
                    
                    if (requestData.slot?.scheduledDate) {
                      const dateObj = requestData.slot.scheduledDate.toDate ? requestData.slot.scheduledDate.toDate() : new Date(requestData.slot.scheduledDate);
                      scheduledDateStr = ` (${dateObj.toLocaleDateString()})`;
                    }
                    
                    for (const discordId of managerDiscordIds) {
                      try {
                        if (skipDms) {
                          console.log(`[SKIP_DMS] Would send scrim request DM to ${discordId}`);
                          sentCount++;
                          continue;
                        }
                        const user = await client.users.fetch(discordId);
                        if (user) {
                          const embed = new EmbedBuilder()
                            .setTitle('⚔️ New Scrim Request!')
                            .setColor('#0099ff')
                            .setDescription(`Your team **${requestData.toTeamName}** has received a new scrim request!`)
                            .addFields(
                              { name: 'From Team', value: requestData.fromTeamName || 'Unknown Team', inline: true },
                              { name: 'Proposed Time', value: `${slotDay} at ${slotHour}${scheduledDateStr}`, inline: true },
                                { name: 'Action Required', value: 'Please choose to accept or reject this request below, or via the Swissplay website.' }
                              )
                              .setTimestamp();
                              
                            const actionRow = new ActionRowBuilder()
                              .addComponents(
                                new ButtonBuilder()
                                  .setCustomId(`scrimreq_accepted_${requestId}`)
                                  .setLabel('Accept')
                                  .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                  .setCustomId(`scrimreq_rejected_${requestId}`)
                                  .setLabel('Reject')
                                  .setStyle(ButtonStyle.Danger)
                              );
                              
                            await user.send({ embeds: [embed], components: [actionRow] });
                            sentCount++;
                          }
                        } catch (err) {
                        console.error(`❌ Failed to DM manager ${discordId} for scrim request:`, err.message);
                      }
                    }
                    
                    if (sentCount > 0) {
                      // Update document to mark DM as sent
                      await requestsRef.doc(requestId).update({
                        discordDMSent: true,
                        discordDMSentAt: new Date()
                      });
                      console.log(`✅ Scrim request DM sent to ${sentCount} manager(s) of ${requestData.toTeamName}`);
                    } else {
                      // Mark as sent anyway so we don't keep trying if DM failed
                      await requestsRef.doc(requestId).update({
                        discordDMSent: true,
                        discordDMSentError: 'Failed to send DM to managers'
                      });
                    }
                  } else {
                    console.log(`⚠️ No manager with Discord ID found for team ${requestData.toTeamName}`);
                    // Mark as sent anyway so we don't keep trying
                    await requestsRef.doc(requestId).update({
                      discordDMSent: true,
                      discordDMSentError: 'No manager with linked Discord ID found'
                    });
                  }
                }
              } catch (error) {
                console.error(`❌ Failed to process scrim request DM:`, error.message);
              }
            }, 2000); // Delay slightly to ensure data consistency
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Error setting up scrim request listener:', error);
  }
}

function setupScrimReminderSystem(client, skipDms = false) {
  console.log('⏰ Setting up scrim reminder system...');
  
  // Check for upcoming scrims every 5 minutes
  setInterval(async () => {
    try {
      await checkAndSendScrimReminders(client, skipDms);
    } catch (error) {
      console.error('Error in scrim reminder system:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Also run immediately
  setTimeout(() => checkAndSendScrimReminders(client, skipDms), 10000);
  
  console.log('✅ Scrim reminder system active');
}

async function checkAndSendScrimReminders(client, skipDms = false) {
  const db = getFirestore();
  const now = new Date();
  
  try {
    // Get active and awaiting_outcome scrim polls
    const pollsSnapshot = await db.collection('scrimPolls')
      .where('status', 'in', ['active', 'awaiting_outcome'])
      .get();
    
    for (const pollDoc of pollsSnapshot.docs) {
      const poll = { id: pollDoc.id, ...pollDoc.data() };
      
      // Parse scrim date and time
      const scrimDateTime = parseScrimDateTime(poll.date, poll.time);
      if (!scrimDateTime) continue;
      
      const timeUntilScrim = scrimDateTime - now;
      const hoursUntil = timeUntilScrim / (1000 * 60 * 60);
      
      if (poll.status === 'active') {
        // Send 24-hour reminder
        if (hoursUntil <= 24 && hoursUntil > 23 && !poll.reminder24hSent) {
          await sendScrimReminder(client, db, poll, '24 hours', pollDoc, skipDms);
        }
        
        // Send 1-hour reminder
        if (hoursUntil <= 1 && hoursUntil > 0.5 && !poll.reminder1hSent) {
          await sendScrimReminder(client, db, poll, '1 hour', pollDoc, skipDms);
        }
        
        // Prompt for outcome 2 hours after scrim
        if (hoursUntil < -2) { 
          await pollDoc.ref.update({ 
            status: 'awaiting_outcome',
            lastOutcomeReminderSentAt: now
          });
          await promptManagersForOutcome(client, db, poll, skipDms);
        }
      } else if (poll.status === 'awaiting_outcome') {
        // Remind every 24 hours until outcome is provided
        const lastReminder = poll.lastOutcomeReminderSentAt ? poll.lastOutcomeReminderSentAt.toDate() : scrimDateTime;
        const hoursSinceLastReminder = (now - lastReminder) / (1000 * 60 * 60);
        
        if (hoursSinceLastReminder >= 24) {
          await promptManagersForOutcome(client, db, poll, skipDms);
          await pollDoc.ref.update({ lastOutcomeReminderSentAt: now });
        }
      }
    }
  } catch (error) {
    console.error('Error checking scrim reminders:', error);
  }
}

async function promptManagersForOutcome(client, db, poll, skipDms = false) {
  if (skipDms) return;
  const teamDoc = await db.collection('teams').doc(poll.teamId).get();
  if (!teamDoc.exists) return;
  const team = teamDoc.data();
  
  // Send to all managers, default to the one who created the poll
  const managerIds = (team.managerDiscordIds && team.managerDiscordIds.length > 0) 
    ? team.managerDiscordIds 
    : [poll.managerId];
  
  for (const managerId of managerIds) {
    if (!managerId) continue;
    try {
      const manager = await client.users.fetch(managerId);
      const embed = new EmbedBuilder()
        .setTitle('🏆 Scrim Outcome Required')
        .setDescription(`Your scrim for **${team.name || poll.teamName}** on ${poll.date} at ${poll.time} has finished! What was the outcome?`)
        .setColor(0x00a8ff);
        
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`outcome_win_${poll.id}`)
            .setLabel('Win')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`outcome_loss_${poll.id}`)
            .setLabel('Loss')
            .setStyle(ButtonStyle.Danger)
        );
        
      await manager.send({ embeds: [embed], components: [row] });
      console.log(`Prompted manager ${managerId} for outcome of scrim ${poll.id}`);
    } catch (error) {
      console.log(`Could not send outcome prompt to manager ${managerId}:`, error.message);
    }
  }
}

async function sendScrimReminder(client, db, poll, timeframe, pollDoc, skipDms = false) {
  if (skipDms) return;
  const teamDoc = await db.collection('teams').doc(poll.teamId).get();
  if (!teamDoc.exists) return;
  
  const team = teamDoc.data();
  const responses = poll.responses || {};
  
  // Get players who said yes
  const confirmedPlayerIds = Object.entries(responses)
    .filter(([_, r]) => r.response === 'Available')
    .map(([id, _]) => id);
  
  // Send reminder to confirmed players
  for (const playerId of confirmedPlayerIds) {
    try {
      const user = await client.users.fetch(playerId);
      
      const embed = new EmbedBuilder()
        .setTitle(`⏰ Scrim Reminder - ${timeframe}!`)
        .setDescription(`Your scrim for **${team.name || poll.teamName}** is coming up!`)
        .addFields(
          { name: 'Date', value: poll.date, inline: true },
          { name: 'Time', value: poll.time, inline: true }
        )
        .setColor(0xffaa00);
      
      if (poll.notes) {
        embed.addFields({ name: 'Notes', value: poll.notes, inline: false });
      }
      
      await user.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send reminder to ${playerId}:`, error.message);
    }
  }
  
  // Mark reminder as sent
  if (timeframe === '24 hours') {
    await pollDoc.ref.update({ reminder24hSent: true });
  } else if (timeframe === '1 hour') {
    await pollDoc.ref.update({ reminder1hSent: true });
  }
  
  console.log(`⏰ Sent ${timeframe} reminder for scrim ${poll.id} (${confirmedPlayerIds.length} players)`);
}

function parseScrimDateTime(dateStr, timeStr) {
  try {
    // Parse date (format: YYYY-MM-DD)
    const dateParts = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!dateParts) return null;
    
    // Parse time (format: HH:MM)
    const timeParts = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!timeParts) return null;
    
    const year = parseInt(dateParts[1]);
    const month = parseInt(dateParts[2]) - 1; // JS months are 0-indexed
    const day = parseInt(dateParts[3]);
    const hour = parseInt(timeParts[1]);
    const minute = parseInt(timeParts[2]);
    
    return new Date(year, month, day, hour, minute);
  } catch (error) {
    return null;
  }
}

async function handleScrimPollResponse(interaction, pollId, responseType) {
  const db = getFirestore();
  const playerId = interaction.user.id;
  
  try {
    // Defer reply to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    // Get poll document
    const pollRef = db.collection('scrimPolls').doc(pollId);
    const pollDoc = await pollRef.get();
    
    if (!pollDoc.exists) {
      await interaction.followUp({ content: '❌ Poll not found or expired.', ephemeral: true });
      return;
    }
    
    const poll = pollDoc.data();
    
    // Record response
    const responses = poll.responses || {};
    
    let responseText = '';
    let responseEmoji = '';
    
    switch (responseType) {
      case 'yes':
        responseText = 'Available';
        responseEmoji = '✅';
        break;
      case 'no':
        responseText = 'Unavailable';
        responseEmoji = '❌';
        break;
      case 'maybe':
        responseText = 'Maybe';
        responseEmoji = '⏰';
        break;
    }
    
    responses[playerId] = {
      username: interaction.user.username,
      response: responseText,
      respondedAt: new Date()
    };
    
    await pollRef.update({ responses });
    
    // Confirm to player
    await interaction.followUp({
      content: `${responseEmoji} Response recorded: **${responseText}**\n\nYour manager will be notified.`,
      ephemeral: true
    });
    
    // Notify manager
    try {
      const manager = await interaction.client.users.fetch(poll.managerId);
      
      // Calculate response summary
      const totalResponses = Object.keys(responses).length;
      const yesCount = Object.values(responses).filter(r => r.response === 'Available').length;
      const noCount = Object.values(responses).filter(r => r.response === 'Unavailable').length;
      const maybeCount = Object.values(responses).filter(r => r.response === 'Maybe').length;
      
      const notifyEmbed = new EmbedBuilder()
        .setTitle('📝 Scrim Poll Response')
        .setDescription(`${interaction.user.username} responded: **${responseText}**`)
        .addFields(
          { name: 'Scrim', value: `${poll.date} at ${poll.time}`, inline: false },
          { name: 'Response Summary', value: `✅ Yes: ${yesCount} | ❌ No: ${noCount} | ⏰ Maybe: ${maybeCount}`, inline: false },
          { name: 'Total Responses', value: `${totalResponses} player(s)`, inline: true }
        )
        .setColor(responseType === 'yes' ? 0x00ff00 : responseType === 'no' ? 0xff0000 : 0xffaa00);
      
      await manager.send({ embeds: [notifyEmbed] });
    } catch (error) {
      console.error('Failed to notify manager:', error);
    }
    
  } catch (error) {
    console.error('Error handling scrim poll response:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleOutcomeResponse(interaction, pollId, outcome) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const db = getFirestore();
    const pollRef = db.collection('scrimPolls').doc(pollId);
    const pollDoc = await pollRef.get();
    
    if (!pollDoc.exists) {
      await interaction.followUp({ content: '❌ Scrim poll not found.', ephemeral: true });
      return;
    }
    
    const poll = pollDoc.data();
    
    if (poll.status !== 'awaiting_outcome') {
      await interaction.followUp({ content: `❌ Outcome has already been recorded or poll is not awaiting an outcome.`, ephemeral: true });
      return;
    }
    
    await pollRef.update({
      status: 'completed',
      outcome: outcome,
      outcomeReportedBy: interaction.user.id,
      outcomeReportedAt: new Date()
    });
    
    const outcomeText = outcome === 'win' ? '✅ Win' : '❌ Loss';
    
    await interaction.followUp({
      content: `Recorded **${outcomeText}** for the scrim on ${poll.date}. Thank you!`,
      ephemeral: true
    });
    
    try {
      if (interaction.message) {
        await interaction.message.edit({ components: [] });
      }
    } catch (editError) {
      console.log('Could not clear components from original message:', editError.message);
    }
  } catch (error) {
    console.error('Error handling outcome response:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

// Start HTTP server for Cloud Run health checks FIRST

// Slash command handlers
async function handleAvailabilityRequestSlash(interaction) {
  try {
    await interaction.deferReply(); // Defer since this might take a moment
    
    const playersOption = interaction.options.getString('players');
    const periodOption = interaction.options.getString('period');
    
    // Parse mentions from the players string if provided
    const args = [];
    const mentionedUserIds = [];
    
    if (playersOption) {
      // Extract user IDs from mentions (format: <@123456789> or <@!123456789>)
      const mentionRegex = /<@!?(\d+)>/g;
      let match;
      while ((match = mentionRegex.exec(playersOption)) !== null) {
        mentionedUserIds.push(match[1]);
        args.push(`<@${match[1]}>`);
      }
      
      // Check if "all" is in the string
      if (playersOption.toLowerCase().includes('all')) {
        args.push('all');
      }
    }
    
    if (periodOption) args.push(periodOption);
    
    // Fetch mentioned users to create proper mentions map
    const mentionedUsers = new Map();
    for (const userId of mentionedUserIds) {
      try {
        const user = await interaction.client.users.fetch(userId);
        mentionedUsers.set(userId, user);
      } catch (error) {
        console.error(`Failed to fetch user ${userId}:`, error);
      }
    }
    
    // Convert interaction to message-like format for compatibility
    const fakeMessage = {
      author: interaction.user,
      client: interaction.client,
      guild: interaction.guild,
      channel: interaction.channel,
      mentions: {
        users: mentionedUsers
      },
      reply: async (content) => {
        if (interaction.deferred) {
          return await interaction.followUp(typeof content === 'string' ? { content } : content);
        }
        return await interaction.reply(typeof content === 'string' ? { content, ephemeral: false } : { ...content, ephemeral: false });
      }
    };
    
    await handleAvailabilityRequest(fakeMessage, args);
  } catch (error) {
    console.error('Error in handleAvailabilityRequestSlash:', error);
    if (interaction.deferred) {
      await interaction.followUp({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
}

async function handleListPlayersSlash(interaction) {
  try {
    await interaction.deferReply(); // Defer immediately to prevent timeout

    const db = getFirestore();
    const managerTeams = await getManagerTeams(db, interaction.user.id);
    const guildId = interaction.guild?.id;
    if (managerTeams.length > 0 && guildId) {
      await ensureTeamLinkedToGuild(db, managerTeams[0].id, guildId);
    }
    
    const fakeMessage = {
      author: interaction.user,
      client: interaction.client,
      guild: interaction.guild,
      channel: interaction.channel,
      reply: async (content) => {
        if (interaction.deferred) {
          return await interaction.followUp(typeof content === 'string' ? { content } : content);
        }
        return await interaction.reply(typeof content === 'string' ? { content, ephemeral: false } : { ...content, ephemeral: false });
      }
    };
    
    await handleListPlayers(fakeMessage);
  } catch (error) {
    console.error('Error in handleListPlayersSlash:', error);
    if (interaction.deferred) {
      await interaction.followUp({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
}

async function handleVerifyDiscordSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const code = interaction.options.getString('code');
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      await interaction.followUp({
        content: '❌ Missing verification code. Please copy the code from the website and try again.',
        ephemeral: true
      });
      return;
    }
    const db = getFirestore();
    
    // Get verification document
    const verificationRef = db.collection('discordVerifications').doc(code);
    const verificationDoc = await verificationRef.get();
    
    if (!verificationDoc.exists) {
      await interaction.followUp({ 
        content: '❌ Verification code not found. Please check the code and try again.', 
        ephemeral: true 
      });
      return;
    }
    
    const verificationData = verificationDoc.data();
    
    // Check if already processed
    if (verificationData.status !== 'pending') {
      await interaction.followUp({ 
        content: `❌ This verification code has already been ${verificationData.status}.`, 
        ephemeral: true 
      });
      return;
    }
    
    // Check expiration
    const createdAt = verificationData.createdAt?.toDate();
    if (createdAt && Date.now() - createdAt.getTime() > 10 * 60 * 1000) {
      await verificationRef.update({ status: 'expired' });
      await interaction.followUp({ 
        content: '❌ This verification code has expired. Please request a new one from the web app.', 
        ephemeral: true 
      });
      return;
    }
    
    // Update verification with the actual Discord User ID from the interaction
    // (We don't require users to enter their Discord ID anymore)
    const discordUserId = interaction.user.id;
    
    // Update the verification document with the Discord User ID
    await verificationRef.update({ 
      discordUserId: discordUserId,
      discordUsername: interaction.user.username
    });
    
    // Send confirmation DM
    await sendVerificationDM(
      interaction.client,
      discordUserId,
      code,
      verificationData.userEmail,
      verificationData.userName,
      verificationData.teamName
    );
    
    await interaction.followUp({ 
      content: '✅ Verification DM sent! Check your DMs and click the confirmation button to link your account.', 
      ephemeral: true 
    });
  } catch (error) {
    console.error('Error in handleVerifyDiscordSlash:', error);
    if (interaction.deferred) {
      await interaction.followUp({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
}

async function handleInviteSlash(interaction) {
  const clientId = process.env.DISCORD_CLIENT_ID || '1445440806797185129';
  // Permissions: View Channels, Send Messages, Embed Links, Read Message History, Add Reactions
  const permissions = '84672';
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

  const embed = new EmbedBuilder()
    .setTitle('🤖 Add Swiss Play Bot to Your Server')
    .setDescription(
      'Click the button below to add the Swiss Play bot to your own Discord server.\n\n' +
      '**What you get:**\n' +
      '• Team availability management\n' +
      '• Scrim scheduling and polling\n' +
      '• Player invites via Discord\n' +
      '• Free agent discovery\n\n' +
      '_You need Administrator or Manage Server permission to add the bot._'
    )
    .setColor(0x7289da)
    .setFooter({ text: 'Create a team at swissplay.gg first, then add the bot!' });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Add Bot to My Server')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl)
    );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

async function handleHelpSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true }); // Must defer first - Firestore can take >3s
    const db = getFirestore();
    const isManager = (await getManagerTeams(db, interaction.user.id)).length > 0;
  
  const playerEmbed = new EmbedBuilder()
    .setTitle('🤖 SwissPlay Bot - Player Commands')
    .setDescription('Commands available to all players:')
    .setColor(0x7289da)
    .addFields(
      {
        name: '`/my-availability`',
        value: 'Set your availability via DM. Just tell the bot when you can play!\nExample: "Weekdays 6-10pm" or "Mon/Wed/Fri 7-9pm"'
      },
      {
        name: '`/my-team`',
        value: 'View your team roster, schedule, and your availability in a DM.'
      },
      {
        name: '`/upcoming-scrims`',
        value: 'See all scheduled scrims and your responses.'
      },
      {
        name: '`/event-summary`',
        value: 'View upcoming calendar events for your team (next 7 days).'
      },
      {
        name: '`/my-timezone`',
        value: 'Set your timezone so event reminders show times correctly (e.g. America/New_York).'
      },
      {
        name: '`/help`',
        value: 'Show this help message'
      },
      {
        name: '`/invite`',
        value: 'Get a link to add the bot to your own Discord server'
      }
    )
    .setFooter({ text: 'All availability and team info is sent privately via DM.' });
  
  const embeds = [playerEmbed];
  
  if (isManager) {
    const managerEmbed = new EmbedBuilder()
      .setTitle('🛡️ SwissPlay Bot - Manager Commands')
      .setDescription('Additional commands for verified managers:')
      .setColor(0x00ff00)
      .addFields(
        {
          name: '`/add-player @user`',
          value: 'Add a Discord server member to your team. They can immediately use player commands.'
        },
        {
          name: '`/remove-player @user`',
          value: 'Remove a player from your team.'
        },
        {
          name: '`/schedule-scrim date:tomorrow time:7pm`',
          value: 'Schedule a scrim and poll your team. Bot DMs all players for availability.'
        },
        {
          name: '`/find-time`',
          value: 'Analyze team availability and suggest best times for scrims.'
        },
        {
          name: '`/team-stats`',
          value: 'View detailed team availability analytics and engagement metrics.'
        },
        {
          name: '`/list-players`',
          value: 'List all players in your team with Discord status and availability.'
        },
        {
          name: '`/find-free-agents`',
          value: 'Browse free agents looking for teams. Filter by role, region, SR.'
        },
        {
          name: '`/request-availability`',
          value: 'Pick a time window from the menu; optionally mention players or use "all" for the whole team.'
        },
        {
          name: '`/upload-scrim`',
          value: 'Upload ScrimTime CSV log file to team dashboard.'
        }
      )
      .setFooter({ text: 'Manager verification required - verify on website first!' });
    
    embeds.push(managerEmbed);
  } else {
    playerEmbed.addFields({
      name: '🛡️ Want to Manage a Team?',
      value: 'Create a team on the website, then verify your Discord in Team Management → Settings.'
    });
  }

  await interaction.editReply({ embeds, ephemeral: true });
  } catch (error) {
    console.error('Error in handleHelpSlash:', error);
    if (interaction.deferred) {
      await interaction.editReply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleUploadScrimSlash(interaction) {
  try {
    await interaction.deferReply();
    
    const attachment = interaction.options.getAttachment('logfile');
    if (!attachment) {
      await interaction.followUp('❌ No attachment found.');
      return;
    }

    if (!attachment.name.endsWith('.csv') && !attachment.name.endsWith('.txt')) {
      await interaction.followUp('❌ Please upload a .csv or .txt file from ScrimTime.');
      return;
    }

    // Download file
    const response = await fetch(attachment.url);
    const content = await response.text();

    if (!isValidScrimTimeCSV(content)) {
      await interaction.followUp('❌ Invalid ScrimTime format. Make sure you are using workshop code **9GPA9**.');
      return;
    }

    const scrimData = parseScrimTimeCSV(content);
    const db = getFirestore();
    
    // Find user's team
    const teamsSnapshot = await db.collection('teams').get();
    const userTeam = teamsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .find(t => t.members && t.members.some(m => m.discordId === interaction.user.id));

    if (!userTeam) {
      await interaction.followUp('❌ You must have your Discord account linked to a team on Solaris to upload logs. Please link your Discord account from the website or contact your manager.');
      return;
    }

    // Check if user is manager/owner
    const member = userTeam.members.find(m => m.discordId === interaction.user.id);
    const isManager = member.roles.includes('Manager') || member.roles.includes('Owner');

    if (!isManager) {
      await interaction.followUp('❌ Only team managers or owners can upload scrim logs.');
      return;
    }

    // Save to Firestore
    await db.collection('scrimLogs').add({
      teamId: userTeam.id,
      uploadedByDiscordId: interaction.user.id,
      uploadedAt: new Date(),
      matchMetadata: scrimData.metadata,
      playerStats: scrimData.players,
      teamStats: scrimData.teams,
      killLog: scrimData.killLog,
      ultimateLog: scrimData.ultimates,
      roundStats: scrimData.rounds,
      source: 'discord'
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Scrim Data Uploaded')
      .setDescription(`Successfully parsed match: **${scrimData.metadata?.mapName || 'Unknown Map'}**`)
      .addFields(
        { name: 'Teams', value: `${scrimData.metadata?.team1Name || 'Team 1'} vs ${scrimData.metadata?.team2Name || 'Team 2'}` },
        { name: 'Score', value: `${scrimData.metadata?.score1 || 0} - ${scrimData.metadata?.score2 || 0}` },
        { name: 'Players', value: `${scrimData.players.length} operatives tracked` }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.followUp({ embeds: [embed] });

  } catch (error) {
    console.error('Error in handleUploadScrimSlash:', error);
    await interaction.followUp(`❌ Failed to process scrim log: ${error.message}`);
  }
}

async function handleMyAvailabilitySlash(interaction) {
  try {
    await interaction.reply({ content: '📅 Check your DMs! I sent you a message to set your availability.', ephemeral: true });
    
    const user = interaction.user;
    const db = getFirestore();
    
    // Find user's team(s)
    const teamsSnapshot = await db.collection('teams').get();
    const userTeams = teamsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(t => t.members && t.members.some(m => m.discordId === user.id));
    
    if (userTeams.length === 0) {
      await user.send({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Not on a Team')
          .setDescription('You\'re not currently on any team. Ask a manager to add you using `/add-player`.')
          .setColor(0xff0000)]
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📅 Set Your Availability')
      .setDescription(
        'Let me know when you\'re available for scrims!\n\n' +
        '**Examples:**\n' +
        '• "Weekdays after 6pm"\n' +
        '• "Monday Wednesday Friday 7-10pm"\n' +
        '• "Weekends anytime"\n' +
        '• "Tuesday Thursday 8-11pm"\n\n' +
        'Just reply to this DM with your availability!'
      )
      .setColor(0x7289da)
      .setFooter({ text: 'Your availability will be saved and visible to your team manager.' });
    
    await user.send({ embeds: [embed] });
    
    // Store pending availability update
    await db.collection('pendingAvailabilityUpdates').doc(user.id).set({
      userId: user.id,
      username: user.username,
      teamIds: userTeams.map(t => t.id),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 min expiry
    });
    
  } catch (error) {
    console.error('Error in handleMyAvailabilitySlash:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleMyTeamSlash(interaction) {
  try {
    await interaction.reply({ content: '👥 Check your DMs! I sent you your team info.', ephemeral: true });
    
    const user = interaction.user;
    const db = getFirestore();
    
    // Find user's team(s)
    const teamsSnapshot = await db.collection('teams').get();
    const userTeams = teamsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(t => t.members && t.members.some(m => m.discordId === user.id));
    
    if (userTeams.length === 0) {
      await user.send({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Not on a Team')
          .setDescription('You\'re not currently on any team. Ask a manager to add you using `/add-player`.')
          .setColor(0xff0000)]
      });
      return;
    }
    
    for (const team of userTeams) {
      const myMember = team.members.find(m => m.discordId === user.id);
      const availText = myMember?.availabilityText || 'Not set';
      
      const rosterText = team.members
        .map(m => `• ${m.discordUsername || m.name || 'Unknown'} ${m.discordId === user.id ? '(You)' : ''}`)
        .join('\n')
        .slice(0, 1000);
      
      // Get upcoming scrims for this team
      const upcomingScrims = await db.collection('scrimPolls')
        .where('teamId', '==', team.id)
        .where('status', '==', 'active')
        .get();
      
      let scrimsText = 'No upcoming scrims';
      if (!upcomingScrims.empty) {
        const scrimList = upcomingScrims.docs
          .map(doc => {
            const s = doc.data();
            const myResponse = s.responses?.[user.id];
            const statusEmoji = myResponse?.response === 'Available' ? '✅' : 
                               myResponse?.response === 'Unavailable' ? '❌' : 
                               myResponse?.response === 'Maybe' ? '⏰' : '❓';
            return `${statusEmoji} ${s.date} at ${s.time}`;
          })
          .slice(0, 3)
          .join('\n');
        scrimsText = scrimList || 'No upcoming scrims';
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`👥 ${team.name || 'Your Team'}`)
        .addFields(
          { name: 'Your Availability', value: availText, inline: false },
          { name: 'Upcoming Scrims', value: scrimsText, inline: false },
          { name: 'Team Roster', value: rosterText || 'No members', inline: false }
        )
        .setColor(0x00ff00)
        .setFooter({ text: 'Use /my-availability to update | /upcoming-scrims to see all scrims' });
      
      await user.send({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('Error in handleMyTeamSlash:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleTeamStatsSlash(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const db = getFirestore();
    const managerDiscordId = interaction.user.id;
    
    // Check if user is a verified manager
    const managerTeams = await getManagerTeams(db, managerDiscordId);
    
    if (managerTeams.length === 0) {
      await interaction.followUp({
        content: '❌ You are not a verified manager. Please verify on the website first.',
        ephemeral: true
      });
      return;
    }
    
    const team = managerTeams[0]; // Use first team
    const guildId = interaction.guild?.id;
    if (guildId) await ensureTeamLinkedToGuild(db, team.id, guildId);
    
    // Calculate availability stats
    const totalMembers = team.members.length;
    const membersWithAvailability = team.members.filter(m => 
      Array.isArray(m.availability) && m.availability.length > 0
    ).length;
    
    const availabilityPercentage = totalMembers > 0 
      ? ((membersWithAvailability / totalMembers) * 100).toFixed(0)
      : 0;
    
    // Calculate average availability per day
    const dayStats = {};
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    for (const day of days) {
      let count = 0;
      for (const member of team.members) {
        if (Array.isArray(member.availability) && 
            member.availability.some(slot => slot.day === day)) {
          count++;
        }
      }
      dayStats[day] = count;
    }
    
    // Sort days by availability
    const sortedDays = Object.entries(dayStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 7);
    
    const dayStatsText = sortedDays
      .map(([day, count]) => {
        const emoji = count >= totalMembers * 0.7 ? '🟢' : count >= totalMembers * 0.4 ? '🟡' : '🔴';
        const percentage = totalMembers > 0 ? ((count / totalMembers) * 100).toFixed(0) : 0;
        return `${emoji} ${day}: ${count}/${totalMembers} (${percentage}%)`;
      })
      .join('\n');
    
    // Get recent scrim response rate
    const recentScrims = await db.collection('scrimPolls')
      .where('teamId', '==', team.id)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    let avgResponseRate = 'N/A';
    if (!recentScrims.empty) {
      let totalResponseRate = 0;
      let scrimCount = 0;
      
      recentScrims.docs.forEach(doc => {
        const scrim = doc.data();
        const responseCount = Object.keys(scrim.responses || {}).length;
        const rate = totalMembers > 0 ? (responseCount / totalMembers) * 100 : 0;
        totalResponseRate += rate;
        scrimCount++;
      });
      
      avgResponseRate = `${(totalResponseRate / scrimCount).toFixed(0)}%`;
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`📊 Team Analytics: ${team.name}`)
      .setDescription(`Availability and engagement statistics`)
      .addFields(
        { name: 'Team Size', value: `${totalMembers} members`, inline: true },
        { name: 'Availability Set', value: `${membersWithAvailability}/${totalMembers} (${availabilityPercentage}%)`, inline: true },
        { name: 'Avg. Poll Response', value: avgResponseRate, inline: true },
        { name: 'Daily Availability', value: dayStatsText || 'No data', inline: false }
      )
      .setColor(0x7289da)
      .setFooter({ text: 'Use /find-time to find optimal scrim times!' });
    
    await interaction.followUp({ embeds: [embed], ephemeral: true });
    
  } catch (error) {
    console.error('Error in handleTeamStatsSlash:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

async function handleUpcomingScrimsSlash(interaction) {
  try {
    await interaction.deferReply();
    
    const user = interaction.user;
    const db = getFirestore();
    
    // Find user's team(s)
    const teamsSnapshot = await db.collection('teams').get();
    const userTeams = teamsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(t => t.members && t.members.some(m => m.discordId === user.id));
    
    if (userTeams.length === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Not on a Team')
          .setDescription('You\'re not currently on any team.')
          .setColor(0xff0000)]
      });
      return;
    }
    
    // Get all active scrims for user's teams
    const teamIds = userTeams.map(t => t.id);
    const allScrims = [];
    
    for (const teamId of teamIds) {
      const scrimsSnapshot = await db.collection('scrimPolls')
        .where('teamId', '==', teamId)
        .where('status', '==', 'active')
        .get();
      
      scrimsSnapshot.docs.forEach(doc => {
        allScrims.push({ id: doc.id, ...doc.data() });
      });
    }
    
    if (allScrims.length === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('📅 No Upcoming Scrims')
          .setDescription('Your team has no scheduled scrims yet.')
          .setColor(0xffaa00)]
      });
      return;
    }
    
    // Sort by date/time
    allScrims.sort((a, b) => {
      const dateA = parseScrimDateTime(a.date, a.time);
      const dateB = parseScrimDateTime(b.date, b.time);
      return dateA - dateB;
    });
    
    const embed = new EmbedBuilder()
      .setTitle('📅 Upcoming Scrims')
      .setDescription(`You have ${allScrims.length} scheduled scrim(s)`)
      .setColor(0x7289da);
    
    for (const scrim of allScrims.slice(0, 10)) {
      const myResponse = scrim.responses?.[user.id];
      const statusEmoji = myResponse?.response === 'Available' ? '✅' : 
                         myResponse?.response === 'Unavailable' ? '❌' : 
                         myResponse?.response === 'Maybe' ? '⏰' : '❓';
      
      const yesCount = Object.values(scrim.responses || {}).filter(r => r.response === 'Available').length;
      const totalResponses = Object.keys(scrim.responses || {}).length;
      
      embed.addFields({
        name: `${statusEmoji} ${scrim.date} at ${scrim.time}`,
        value: `Team: **${scrim.teamName}**\n` +
               `Confirmed: ${yesCount} player(s) (${totalResponses} responded)` + 
               (scrim.notes ? `\nNotes: ${scrim.notes}` : ''),
        inline: false
      });
    }
    
    if (allScrims.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${allScrims.length} scrims` });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error in handleUpcomingScrimsSlash:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ An error occurred: ${error.message}`, ephemeral: true });
    }
  }
}

// Start HTTP server for Cloud Run health checks FIRST
// This ensures Cloud Run health checks pass even if Discord/Firebase fail
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      bot: client.user ? 'connected' : 'connecting',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Start HTTP server first (required for Cloud Run)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP server listening on port ${PORT}`);
  
  // Start Discord bot after HTTP server is ready
  if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN environment variable is not set');
    console.log('⚠️  Bot will not connect to Discord, but HTTP server is running');
    return;
  }
  
  console.log('🤖 Attempting to connect to Discord...');
  client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Failed to login to Discord:', error.message);
    console.log('⚠️  HTTP server is still running for health checks');
    // Don't exit - keep HTTP server running for Cloud Run health checks
  });
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ HTTP server error:', error);
  process.exit(1);
});

// Handle process errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('⚠️  Unhandled promise rejection:', error);
  // Don't exit - keep the container running
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  // Don't exit immediately - let Cloud Run handle it
});

