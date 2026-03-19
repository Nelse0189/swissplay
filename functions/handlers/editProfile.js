import { EmbedBuilder } from 'discord.js';
import admin from 'firebase-admin';
import { getUserByDiscordId } from '../lib/firebase-helpers.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

/**
 * Handle /edit-profile - Update display name, username, bio, skill rating
 */
export async function handleEditProfileSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const displayName = interaction.options.getString('display-name');
  const username = interaction.options.getString('username');
  const bio = interaction.options.getString('bio');
  const skillRating = interaction.options.getInteger('skill-rating');

  const db = admin.firestore();

  try {
    const userData = await getUserByDiscordId(interaction.user.id);
    if (!userData) {
      await interaction.editReply({
        content: `❌ Account not linked. Sign up at ${WEBSITE_URL}/auth and link your Discord first.`,
        ephemeral: true,
      });
      return;
    }

    const updates = {};
    if (displayName?.trim()) updates.displayName = displayName.trim();
    if (bio !== null) updates.bio = bio?.trim() || '';
    if (skillRating != null) updates.skillRating = skillRating;

    if (username?.trim()) {
      const sanitized = username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      if (sanitized.length < 3) {
        await interaction.editReply({
          content: '❌ Username must be at least 3 characters (letters, numbers, underscores only).',
          ephemeral: true,
        });
        return;
      }
      const existing = await db.collection('users').where('username', '==', sanitized).get();
      const conflict = existing.docs.find((d) => d.id !== userData.uid);
      if (conflict) {
        await interaction.editReply({
          content: `❌ Username "${sanitized}" is already taken.`,
          ephemeral: true,
        });
        return;
      }
      updates.username = sanitized;
    }

    if (Object.keys(updates).length === 0) {
      await interaction.editReply({
        content: '❌ No changes provided. Specify at least one of: display-name, username, bio, skill-rating.',
        ephemeral: true,
      });
      return;
    }

    await db.collection('users').doc(userData.uid).update(updates);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Profile Updated')
      .setDescription('Your profile has been updated.')
      .addFields(
        ...Object.entries(updates).map(([k, v]) => ({
          name: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
          value: String(v || '(empty)'),
          inline: true,
        }))
      )
      .setFooter({ text: `Edit photo on website: ${WEBSITE_URL}/profile/edit` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error editing profile:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true,
    });
  }
}
