import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFirestore } from '../firebase/config.js';

/**
 * Find Discord user by username across all guilds the bot is in
 */
export async function findUserByUsername(client, username) {
  // Remove discriminator if present (old format: username#1234)
  // Also handle new Discord username format (just username)
  const cleanUsername = username.split('#')[0].toLowerCase().trim();
  
  console.log(`🔍 Searching for Discord user: ${cleanUsername}`);
  
  // First, try searching in user cache (faster)
  const cachedUser = client.users.cache.find(user => 
    user.username.toLowerCase() === cleanUsername ||
    user.globalName?.toLowerCase() === cleanUsername
  );
  
  if (cachedUser) {
    console.log(`✅ Found user in cache: ${cachedUser.username} (${cachedUser.id})`);
    return cachedUser;
  }
  
  // Search in all guilds the bot is in
  for (const guild of client.guilds.cache.values()) {
    try {
      // Search guild members by username (Discord.js v14+)
      const members = await guild.members.search({ query: cleanUsername, limit: 5 });
      
      if (members.size > 0) {
        // Try to find exact match
        for (const member of members.values()) {
          const user = member.user;
          // Check username (new format) or globalName (display name)
          if (user.username.toLowerCase() === cleanUsername || 
              user.globalName?.toLowerCase() === cleanUsername ||
              user.displayName?.toLowerCase() === cleanUsername) {
            console.log(`✅ Found user: ${user.username} (${user.id}) in guild: ${guild.name}`);
            return user;
          }
        }
        
        // If no exact match, return first result (closest match)
        const firstMember = members.first();
        if (firstMember) {
          console.log(`⚠️  Using closest match: ${firstMember.user.username} (${firstMember.user.id})`);
          return firstMember.user;
        }
      }
    } catch (error) {
      // Some guilds might not allow member search or bot might not have permission
      // This is common if the bot doesn't have "Search Members" permission
      console.log(`⚠️  Could not search in guild ${guild.name}:`, error.message);
    }
  }
  
  console.log(`❌ Could not find Discord user: ${cleanUsername}`);
  return null;
}

/**
 * Send verification DM to Discord user by username (searches automatically)
 */
export async function sendVerificationDMByUsername(client, username, verificationCode, userEmail, userName, teamName, isInvite = false, invitedByName = null) {
  try {
    // First try to find user by username
    const discordUser = await findUserByUsername(client, username);
    
    if (!discordUser) {
      throw new Error(`Could not find Discord user "${username}". Make sure you're in a server with the bot.`);
    }
    
    // Use the found user's ID to send DM
    return await sendVerificationDM(client, discordUser.id, verificationCode, userEmail, userName, teamName, isInvite, invitedByName);
  } catch (error) {
    console.error(`Failed to send verification DM to ${username}:`, error);
    throw error;
  }
}

/**
 * Send verification DM to Discord user
 */
export async function sendVerificationDM(client, discordUserId, verificationCode, userEmail, userName, teamName, isInvite = false, invitedByName = null) {
  try {
    const discordUser = await client.users.fetch(discordUserId);
    
    let embed;
    if (isInvite) {
      // Invite message - inviting to join team (Discord account verification for team invite)
      embed = new EmbedBuilder()
        .setTitle('🎮 Team Invitation - Discord Account Verification')
        .setDescription(
          `You've been invited to join **${teamName || 'Unknown'}**!\n\n` +
          (invitedByName ? `**Invited by:** ${invitedByName}\n\n` : '') +
          `**Team:** ${teamName || 'Unknown'}\n\n` +
          `**To join this team, please verify your Discord account:**\n` +
          `Click "✅ Confirm" to verify your Discord account and join the team roster.\n` +
          `Click "❌ Deny" to decline this invitation.`
        )
        .setColor(0x7289da)
        .setFooter({ text: 'This invitation expires in 10 minutes' });
    } else {
      // Link message - linking existing account
      embed = new EmbedBuilder()
        .setTitle('🔗 Discord Account Link Request')
        .setDescription(
          `**${userName}** is requesting to link this Discord account to their SwissPlay team member profile.\n\n` +
          `**Team Member Details:**\n` +
          `• Name: ${userName}\n` +
          `• Email: ${userEmail || 'Not provided'}\n` +
          `• Team: ${teamName || 'Unknown'}\n\n` +
          `**Is this you?**\n` +
          `If this is your account and you recognize this request, click "✅ Confirm" below.\n` +
          `If this is not your account or you don't recognize this request, click "❌ Deny".`
        )
        .setColor(0x00ff00)
        .setFooter({ text: 'This request expires in 10 minutes' });
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`verify_confirm_${verificationCode}`)
          .setLabel('✅ Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`verify_deny_${verificationCode}`)
          .setLabel('❌ Deny')
          .setStyle(ButtonStyle.Danger)
      );

    await discordUser.send({ embeds: [embed], components: [row] });
    return true;
  } catch (error) {
    console.error(`Failed to send verification DM to ${discordUserId}:`, error);
    throw error;
  }
}

/**
 * Handle verification confirmation button click
 */
export async function handleVerificationConfirm(interaction, verificationCode) {
  const db = getFirestore();
  
  // Check if already replied/deferred
  if (interaction.replied || interaction.deferred) {
    console.log('Interaction already handled, ignoring');
    return;
  }
  
  // Defer reply immediately to prevent timeout
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (error) {
    console.error('Failed to defer reply:', error);
    // Try to reply directly if defer fails
    try {
      await interaction.reply({ 
        content: '⏳ Processing your confirmation...', 
        ephemeral: true 
      });
    } catch (replyError) {
      console.error('Failed to reply:', replyError);
      return;
    }
  }
  
  try {
    // Guard against empty / missing codes (prevents Firestore "documentPath" crash)
    if (!verificationCode || typeof verificationCode !== 'string' || verificationCode.trim().length === 0) {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ Invalid or missing verification code. Please re-link from the website and try again.' });
      } else {
        await interaction.followUp({ content: '❌ Invalid or missing verification code. Please re-link from the website and try again.', ephemeral: true });
      }
      return;
    }

    // Get verification document
    const verificationRef = db.collection('discordVerifications').doc(verificationCode);
    const verificationDoc = await verificationRef.get();
    
    if (!verificationDoc.exists) {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Verification code not found or expired.'
        });
      } else {
        await interaction.followUp({ 
          content: '❌ Verification code not found or expired.',
          ephemeral: true
        });
      }
      return;
    }
    
    const verificationData = verificationDoc.data();
    
    // Check if already verified
    if (verificationData.status === 'confirmed') {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '✅ This verification has already been confirmed.'
        });
      } else {
        await interaction.followUp({ 
          content: '✅ This verification has already been confirmed.',
          ephemeral: true
        });
      }
      return;
    }
    
    if (verificationData.status === 'denied') {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ This verification was denied.'
        });
      } else {
        await interaction.followUp({ 
          content: '❌ This verification was denied.',
          ephemeral: true
        });
      }
      return;
    }
    
    // Check expiration (10 minutes)
    const createdAt = verificationData.createdAt?.toDate();
    if (createdAt && Date.now() - createdAt.getTime() > 10 * 60 * 1000) {
      await verificationRef.update({ status: 'expired' });
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ This verification code has expired. Please request a new one.'
        });
      } else {
        await interaction.followUp({ 
          content: '❌ This verification code has expired. Please request a new one.',
          ephemeral: true
        });
      }
      return;
    }
    
    // Verify Discord user matches (check both user ID and username)
    // For invites, we only check username since discordUserId won't be set initially
    const userMatches = verificationData.discordUserId === interaction.user.id ||
                        verificationData.discordUsername?.toLowerCase() === interaction.user.username.toLowerCase() ||
                        verificationData.discordUsername?.toLowerCase() === interaction.user.globalName?.toLowerCase();
    
    // Only enforce user matching if we have a discordUserId (for links, not invites)
    // For invites, we'll verify by username match which is already checked above
    if (!userMatches && verificationData.discordUserId) {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ This verification code is not for your Discord account.'
        });
      } else {
        await interaction.followUp({ 
          content: '❌ This verification code is not for your Discord account.',
          ephemeral: true
        });
      }
      return;
    }
    
    // If username was used, update with the actual Discord user ID
    if (!verificationData.discordUserId && verificationData.discordUsername) {
      await verificationRef.update({
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username
      });
    }
    
    // Update verification data with Discord ID if not already set
    if (!verificationData.discordUserId) {
      verificationData.discordUserId = interaction.user.id;
    }
    
    // Ensure we have a valid teamId before trying to load the team doc
    if (!verificationData.teamId || typeof verificationData.teamId !== 'string' || verificationData.teamId.trim().length === 0) {
      // Try to infer team from userUid if present
      if (verificationData.userUid && typeof verificationData.userUid === 'string') {
        try {
          // Prefer indexed lookup if memberUids exists
          const teamsRef = db.collection('teams');
          let inferredTeamDoc = null;
          try {
            const qSnap = await teamsRef.where('memberUids', 'array-contains', verificationData.userUid).limit(1).get();
            if (!qSnap.empty) inferredTeamDoc = qSnap.docs[0];
          } catch (e) {
            // Some teams may not have memberUids or index; fall back to scan
          }

          if (!inferredTeamDoc) {
            const allTeamsSnap = await teamsRef.get();
            inferredTeamDoc = allTeamsSnap.docs.find(d => {
              const t = d.data();
              return Array.isArray(t?.members) && t.members.some(m => m?.uid === verificationData.userUid);
            }) || null;
          }

          if (inferredTeamDoc) {
            verificationData.teamId = inferredTeamDoc.id;
            const inferredTeam = inferredTeamDoc.data();
            verificationData.teamName = verificationData.teamName || inferredTeam?.name || 'Unknown';
          }
        } catch (inferError) {
          console.error('Failed to infer team for verification:', inferError);
        }
      }
    }

    if (!verificationData.teamId || typeof verificationData.teamId !== 'string' || verificationData.teamId.trim().length === 0) {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ Invalid verification: missing team information. Please re-run verification from Team Management → Settings on the website.'
        });
      } else {
        await interaction.followUp({
          content: '❌ Invalid verification: missing team information. Please re-run verification from Team Management → Settings on the website.',
          ephemeral: true
        });
      }
      return;
    }

    // Update team member with Discord ID and username
    const teamRef = db.collection('teams').doc(verificationData.teamId);
    const teamDoc = await teamRef.get();
    
    if (!teamDoc.exists) {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Team not found.'
        });
      } else {
        await interaction.followUp({ 
          content: '❌ Team not found.',
          ephemeral: true
        });
      }
      return;
    }
    
    const team = { id: teamDoc.id, ...teamDoc.data() };
    
    // Check if this is an invite (new member) or a link (existing member)
    const isInvite = verificationData.isInvite === true;
    
    if (isInvite) {
      // This is an invite - create a new team member
      // Check if member already exists with this Discord ID
      const existingMemberIndex = team.members.findIndex(m => 
        m.discordId === interaction.user.id || 
        m.discordUsername?.toLowerCase() === interaction.user.username.toLowerCase()
      );
      
      if (existingMemberIndex !== -1) {
        // Member already exists, just update their Discord info
        const updatedMembers = [...team.members];
        updatedMembers[existingMemberIndex] = {
          ...updatedMembers[existingMemberIndex],
          discordId: interaction.user.id,
          discordUsername: interaction.user.username
        };
        
        await teamRef.update({ members: updatedMembers });
      } else {
        // Create new team member
        const newMember = {
          discordId: interaction.user.id,
          discordUsername: interaction.user.username,
          name: interaction.user.globalName || interaction.user.username,
          roles: ['Player'],
          availability: []
        };
        
        const updatedMembers = [...team.members, newMember];
        const updatedMemberUids = team.memberUids || [];
        
        await teamRef.update({ 
          members: updatedMembers,
          memberUids: updatedMemberUids
        });
      }
    } else {
      // This is a link - update existing member
      if (!verificationData.userUid) {
        if (interaction.deferred) {
          await interaction.editReply({ 
            content: '❌ Invalid verification: missing user ID.'
          });
        } else {
          await interaction.followUp({ 
            content: '❌ Invalid verification: missing user ID.',
            ephemeral: true
          });
        }
        return;
      }
      
      const memberIndex = team.members.findIndex(m => m.uid === verificationData.userUid);
      
      if (memberIndex === -1) {
        if (interaction.deferred) {
          await interaction.editReply({ 
            content: '❌ Team member not found.'
          });
        } else {
          await interaction.followUp({ 
            content: '❌ Team member not found.',
            ephemeral: true
          });
        }
        return;
      }
      
      // Update member with Discord ID and username
      const updatedMembers = [...team.members];
      updatedMembers[memberIndex] = {
        ...updatedMembers[memberIndex],
        discordId: interaction.user.id,
        discordUsername: interaction.user.username
      };
      
      // Update managerDiscordIds array if it exists
      let managerDiscordIds = team.managerDiscordIds || [];
      const member = updatedMembers[memberIndex];
      if ((member.roles?.includes('Manager') || member.roles?.includes('Owner')) && 
          !managerDiscordIds.includes(interaction.user.id)) {
        managerDiscordIds.push(interaction.user.id);
      }
      
      await teamRef.update({ 
        members: updatedMembers,
        managerDiscordIds: managerDiscordIds
      });

      // Save discordId to users collection so new teams show up in /add-player immediately
      await db.collection('users').doc(verificationData.userUid).set({
        discordId: interaction.user.id,
        discordUsername: interaction.user.username,
        updatedAt: new Date()
      }, { merge: true });
    }
    
    // Mark verification as confirmed
    await verificationRef.update({ 
      status: 'confirmed',
      confirmedAt: new Date(),
      confirmedBy: interaction.user.id,
      confirmedDiscordUsername: interaction.user.username
    });
    
    let successEmbed;
    if (isInvite) {
      successEmbed = new EmbedBuilder()
        .setTitle('✅ Team Invitation Accepted!')
        .setDescription(
          `You've successfully joined **${team.name}**!\n\n` +
          `You are now part of the team roster and can use Discord bot commands.\n\n` +
          `Welcome to the team! 🎮`
        )
        .setColor(0x7289da);
    } else {
      successEmbed = new EmbedBuilder()
        .setTitle('✅ Discord Account Linked!')
        .setDescription(
          `Your Discord account has been successfully linked to:\n` +
          `• **Team:** ${team.name}\n` +
          `• **Name:** ${verificationData.userName}\n` +
          `• **Email:** ${verificationData.userEmail}\n\n` +
          `You can now use Discord bot commands for your team!`
        )
        .setColor(0x00ff00);
    }
    
    // Use editReply if deferred, otherwise followUp
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [successEmbed] });
    } else {
      await interaction.followUp({ embeds: [successEmbed], ephemeral: true });
    }
    
    if (isInvite) {
      console.log(`✅ Discord user ${interaction.user.id} (${interaction.user.username}) joined team ${verificationData.teamId}`);
    } else {
      console.log(`✅ Discord account ${interaction.user.id} (${interaction.user.username}) linked to user ${verificationData.userUid} in team ${verificationData.teamId}`);
    }
  } catch (error) {
    console.error('Error confirming verification:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: `❌ An error occurred: ${error.message}`
        });
      } else {
        await interaction.followUp({ 
          content: `❌ An error occurred: ${error.message}`,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Failed to update reply:', replyError);
    }
  }
}

/**
 * Handle verification denial button click
 */
export async function handleVerificationDeny(interaction, verificationCode) {
  const db = getFirestore();
  
  // Check if already replied/deferred
  if (interaction.replied || interaction.deferred) {
    console.log('Interaction already handled, ignoring');
    return;
  }
  
  // Defer reply immediately to prevent timeout
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (error) {
    console.error('Failed to defer reply:', error);
    // Try to reply directly if defer fails
    try {
      await interaction.reply({ 
        content: '⏳ Processing your denial...', 
        ephemeral: true 
      });
    } catch (replyError) {
      console.error('Failed to reply:', replyError);
      return;
    }
  }
  
  try {
    // Guard against empty / missing codes (prevents Firestore "documentPath" crash)
    if (!verificationCode || typeof verificationCode !== 'string' || verificationCode.trim().length === 0) {
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ Invalid or missing verification code. Please re-link from the website and try again.' });
      } else {
        await interaction.followUp({ content: '❌ Invalid or missing verification code. Please re-link from the website and try again.', ephemeral: true });
      }
      return;
    }

    const verificationRef = db.collection('discordVerifications').doc(verificationCode);
    const verificationDoc = await verificationRef.get();
    
    if (!verificationDoc.exists) {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Verification code not found.'
        });
      } else {
        await interaction.followUp({ 
          content: '❌ Verification code not found.',
          ephemeral: true
        });
      }
      return;
    }
    
    await verificationRef.update({ 
      status: 'denied',
      deniedAt: new Date(),
      deniedBy: interaction.user.id
    });
    
    if (interaction.deferred) {
      await interaction.editReply({ 
        content: '✅ Verification denied. Your Discord account will not be linked.'
      });
    } else {
      await interaction.followUp({ 
        content: '✅ Verification denied. Your Discord account will not be linked.',
        ephemeral: true
      });
    }
    
    console.log(`❌ Discord account ${interaction.user.id} denied verification ${verificationCode}`);
  } catch (error) {
    console.error('Error denying verification:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: `❌ An error occurred: ${error.message}`
        });
      } else {
        await interaction.followUp({ 
          content: `❌ An error occurred: ${error.message}`,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Failed to update reply:', replyError);
    }
  }
}

