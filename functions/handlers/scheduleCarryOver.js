/**
 * Handle /schedule-carryover - Manager toggles whether team availability carries over to next week
 */
import admin from 'firebase-admin';
import { EmbedBuilder } from 'discord.js';
import { getTeamByManagerDiscordId } from '../lib/firebase-helpers.js';

function getFirestore() {
  return admin.firestore();
}

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

export async function handleScheduleCarryOverSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const enabledStr = interaction.options?.getString?.('enabled') ?? interaction.options?.getBoolean?.('enabled');
  const enabled = enabledStr === true || enabledStr === 'on';

  try {
    const db = getFirestore();
    const team = await getTeamByManagerDiscordId(interaction.user.id);

    if (!team) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner to change this setting.',
        ephemeral: true,
      });
      return;
    }

    await db.collection('teams').doc(team.id).update({ scheduleCarryOver: enabled });

    const embed = new EmbedBuilder()
      .setColor(enabled ? 0x57F287 : 0x99aab5)
      .setTitle('Schedule Carryover Updated')
      .setDescription(
        enabled
          ? `✅ **${team.name}** schedule will carry over to the next week.\n\nYou'll receive a Discord DM each Monday reminding you to update the schedule if needed.`
          : `**${team.name}** schedule will **not** carry over. The schedule will be cleared at the start of each week.`
      )
      .setFooter({ text: `Edit on website: ${WEBSITE_URL}/teams/overwatch → Availability tab` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in schedule-carryover:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true,
    });
  }
}
