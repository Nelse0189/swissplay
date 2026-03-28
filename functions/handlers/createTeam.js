import { EmbedBuilder } from 'discord.js';
import admin from 'firebase-admin';
import { getUserByDiscordId } from '../lib/firebase-helpers.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

/**
 * Handle /create-team - Create a new team (user must have linked Discord via web)
 */
export async function handleCreateTeamSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString('name')?.trim() || '';
  const abbreviationRaw = interaction.options.getString('abbreviation')?.trim() || '';
  const region = interaction.options.getString('region')?.trim() || '';
  const rankTier = interaction.options.getString('rank-tier')?.trim() || '';
  const rankDivision = interaction.options.getString('rank-division')?.trim() || '';
  const faceitDiv = interaction.options.getString('faceit-div')?.trim() || '';
  const sr =
    rankTier && rankDivision ? `${rankTier} ${rankDivision}` : null;

  if (!name) {
    await interaction.editReply({ content: '❌ Please provide a team name.' });
    return;
  }
  if (!abbreviationRaw) {
    await interaction.editReply({ content: '❌ Please provide a team abbreviation.' });
    return;
  }
  if (!region || !sr || !faceitDiv) {
    const missing = [
      !region && 'region',
      !sr && 'rank-tier + rank-division',
      !faceitDiv && 'faceit-div',
    ].filter(Boolean);
    await interaction.editReply({
      content: `❌ Missing required fields: ${missing.join(', ')}.`,
    });
    return;
  }
  const abbreviation = abbreviationRaw;

  const db = admin.firestore();

  try {
    const userData = await getUserByDiscordId(interaction.user.id);
    if (!userData) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Account Not Linked')
        .setDescription(
          'You must sign up on the website and link your Discord first.\n\n' +
          `1. Sign in at ${WEBSITE_URL}/auth\n` +
          '2. Go to Edit Profile and link your Discord\n' +
          '3. Use `/verify-discord` with the code from the website\n\n' +
          'Then run `/create-team` again.'
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const initialMember = {
      uid: userData.uid,
      name: userData.displayName || userData.username || interaction.user.username,
      email: userData.email,
      roles: ['Owner', 'Manager'],
      availability: [],
      discordId: interaction.user.id,
      discordUsername: interaction.user.username
    };

    const teamData = {
      name: name.trim(),
      abbreviation: abbreviation.toUpperCase(),
      region,
      sr,
      faceitDiv,
      ownerId: userData.uid,
      members: [initialMember],
      memberUids: [userData.uid],
      managerDiscordIds: [interaction.user.id],
      schedule: [],
      scheduleTimezone: 'America/New_York',
      reliabilityScore: 100,
      createdAt: new Date()
    };

    const docRef = await db.collection('teams').add(teamData);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Team Created!')
      .setDescription(`**${name}** has been created successfully.`)
      .addFields(
        { name: 'Team ID', value: docRef.id, inline: true },
        { name: 'Region', value: region, inline: true },
        { name: 'Division', value: faceitDiv, inline: true }
      )
      .setFooter({
        text: `Manage on web: ${WEBSITE_URL}/teams/overwatch • Use /add-player to invite teammates`
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error creating team:', error);
    await interaction.editReply({
      content: `❌ Failed to create team: ${error.message}`,
      ephemeral: true
    });
  }
}
