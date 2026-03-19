import { EmbedBuilder } from 'discord.js';

export async function handleInviteSlash(interaction) {
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${interaction.applicationId}&permissions=2147485696&scope=bot%20applications.commands`;
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Invite Swiss Play Bot')
    .setDescription(`[Click here to invite the bot to your server](${inviteUrl})`)
    .setFooter({ text: 'Requires permissions to manage events, send messages, and read members.' });
    
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
