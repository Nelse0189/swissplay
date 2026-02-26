import { EmbedBuilder } from 'discord.js';
import { getTeamByManagerDiscordId } from '../utils/firebase-helpers.js';

/**
 * List all players in the team with their Discord status
 */
export async function handleListPlayers(message) {
  const managerDiscordId = message.author.id;

  const team = await getTeamByManagerDiscordId(managerDiscordId);
  
  if (!team) {
    message.reply('❌ You are not a manager of any team.');
    return;
  }

  const players = team.members.filter(m => 
    m.roles && (m.roles.includes('Player') || m.roles.includes('Coach'))
  );

  if (players.length === 0) {
    message.reply('❌ No players found in your team.');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`👥 Players - ${team.name}`)
    .setColor(0x00ff00);

  const playerList = [];
  
  for (const player of players) {
    let status = '❌ Not linked';
    if (player.discordId) {
      try {
        const discordUser = await message.client.users.fetch(player.discordId);
        status = `✅ ${discordUser.username}`;
      } catch (error) {
        status = '⚠️ Invalid Discord ID';
      }
    }
    
    playerList.push({
      name: player.name || 'Unknown',
      value: `Discord: ${status}\nRoles: ${player.roles?.join(', ') || 'None'}`,
      inline: true
    });
  }

  // Split into chunks to avoid embed field limit
  const chunks = [];
  for (let i = 0; i < playerList.length; i += 3) {
    chunks.push(playerList.slice(i, i + 3));
  }

  for (const chunk of chunks) {
    chunk.forEach(field => embed.addFields(field));
  }

  embed.setFooter({ text: `Total: ${players.length} player(s)` });

  message.reply({ embeds: [embed] });
}


