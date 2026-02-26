import { EmbedBuilder } from 'discord.js';
import { getFirestore } from '../firebase/config.js';
import { getTeamByManagerDiscordId } from '../utils/firebase-helpers.js';

/**
 * Link a Discord user to a team member
 * Usage:
 * - !link player@email.com              (link yourself)
 * - !link @player player@email.com      (link another user)
 */
export async function handleLinkDiscord(message, args) {
  try {
    const managerDiscordId = message.author.id;
    console.log(`🔗 Link command called by Discord ID: ${managerDiscordId} (${message.author.username})`);
    
    // Check if Firebase is available
    let db;
    try {
      db = getFirestore();
    } catch (error) {
      console.error('Firebase initialization error:', error);
      await message.reply('❌ Firebase is not properly configured. Please check the server logs.');
      return;
    }

    // Check if user is a manager
    console.log(`🔍 Checking if user ${managerDiscordId} (${message.author.username}) is a manager...`);
    const team = await getTeamByManagerDiscordId(managerDiscordId);
    
    if (!team) {
      console.log(`❌ User ${managerDiscordId} (${message.author.username}) is not found as a manager in any team.`);
      await message.reply('❌ You are not a manager of any team.\n\n💡 **To fix this:**\n1. Make sure you have a Manager or Owner role in your team\n2. Your Discord account needs to be linked to your team member profile\n3. Ask another manager to link your Discord account using `/link` command');
      return;
    }
    
    console.log(`✅ User is manager of team: ${team.name} (${team.id})`);

    // Ensure members array exists
    if (!team.members || !Array.isArray(team.members)) {
      console.error(`❌ Team ${team.id} has no members array.`);
      await message.reply('❌ Team data is invalid (missing members). Please contact support.');
      return;
    }

    if (args.length < 1) {
      await message.reply('❌ Usage: `!link player@email.com` (link yourself) or `!link @player player@email.com`');
      return;
    }

    // If only an email is provided, link the caller's Discord account
    let discordId = null;
    let email = null;

    if (args.length === 1) {
      discordId = message.author.id;
      email = args[0];
    } else {
      // Parse Discord mention or ID
      const mention = args[0];
      if (mention && mention.startsWith('<@') && mention.endsWith('>')) {
        discordId = mention.slice(2, -1);
        if (discordId.startsWith('!')) {
          discordId = discordId.slice(1);
        }
      } else {
        discordId = mention;
      }
      email = args[1];
    }

    if (!discordId || typeof discordId !== 'string' || discordId.trim().length === 0) {
      await message.reply('❌ Could not determine which Discord account to link. Try `!link player@email.com` or `!link @player player@email.com`.');
      return;
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      await message.reply('❌ Missing email. Usage: `!link player@email.com` or `!link @player player@email.com`.');
      return;
    }

    // Find team member by email
    const member = team.members.find(m => 
      m.email === email || (m.uid && m.email?.toLowerCase() === email.toLowerCase())
    );

    if (!member) {
      await message.reply(`❌ No team member found with email: ${email}`);
      return;
    }

    // Try to get Discord user info first
    let discordUsername = null;
    try {
      const discordUser = await message.client.users.fetch(discordId);
      discordUsername = discordUser.username;
    } catch (error) {
      console.error('Failed to fetch Discord user:', error);
    }

    // Update member with Discord ID and username
    const teamRef = db.collection('teams').doc(team.id);
    const updatedMembers = team.members.map(m => {
      if (m.uid === member.uid) {
        return { 
          ...m, 
          discordId,
          ...(discordUsername && { discordUsername })
        };
      }
      return m;
    });

    // Update managerDiscordIds array if member is a manager/owner
    let managerDiscordIds = team.managerDiscordIds || [];
    if ((member.roles?.includes('Manager') || member.roles?.includes('Owner')) && 
        !managerDiscordIds.includes(discordId)) {
      managerDiscordIds.push(discordId);
    }

    await teamRef.update({ 
      members: updatedMembers,
      managerDiscordIds: managerDiscordIds
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Discord Account Linked')
      .setDescription(`Linked ${discordUsername || discordId} to ${member.name || email}`)
      .addFields(
        { name: 'Team Member', value: member.name || email, inline: true },
        { name: 'Discord', value: discordUsername || discordId, inline: true }
      )
      .setColor(0x00ff00);

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in handleLinkDiscord:', error);
    await message.reply(`❌ An error occurred while linking: ${error.message}`);
  }
}


