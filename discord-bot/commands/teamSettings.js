import { EmbedBuilder } from 'discord.js';
import { getFirestore } from '../firebase/config.js';
import { getTeamByManagerDiscordId } from '../utils/firebase-helpers.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

/**
 * Handle /team-settings - Manager updates team name, region, sr, faceit-div
 */
export async function handleTeamSettingsSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString('name');
  const region = interaction.options.getString('region');
  const sr = interaction.options.getString('sr');
  const faceitDiv = interaction.options.getString('faceit-div');

  const db = getFirestore();

  try {
    const team = await getTeamByManagerDiscordId(interaction.user.id);
    if (!team) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner to update team settings.',
        ephemeral: true,
      });
      return;
    }

    const updates = {};
    if (name?.trim()) updates.name = name.trim();
    if (region) updates.region = region;
    if (sr) updates.sr = sr;
    if (faceitDiv) updates.faceitDiv = faceitDiv;

    if (Object.keys(updates).length === 0) {
      await interaction.editReply({
        content: '❌ No changes provided. Specify at least one of: name, region, sr, faceit-div.',
        ephemeral: true,
      });
      return;
    }

    await db.collection('teams').doc(team.id).update(updates);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Team Settings Updated')
      .setDescription(`**${updates.name || team.name}** settings have been updated.`)
      .addFields(
        ...Object.entries(updates).map(([k, v]) => ({
          name: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
          value: String(v),
          inline: true,
        }))
      )
      .setFooter({ text: `Edit team photo on website: ${WEBSITE_URL}/teams/overwatch` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error updating team settings:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true,
    });
  }
}
