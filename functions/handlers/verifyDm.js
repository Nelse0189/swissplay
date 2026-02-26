import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as discordApi from '../discordApi.js';

export async function sendVerificationDMToUser(discordUserId, verificationCode, userEmail, userName, teamName, isInvite = false, invitedByName = null) {
  let embed;
  if (isInvite) {
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
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`verify_confirm_${verificationCode}`).setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`verify_deny_${verificationCode}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger)
  );
  const components = discordApi.componentsToApi([row]);
  await discordApi.sendDM(discordUserId, { embeds: [discordApi.embedToApi(embed)], components });
}
