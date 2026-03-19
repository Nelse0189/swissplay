import { EmbedBuilder } from 'discord.js';
import admin from 'firebase-admin';
import { getUserByDiscordId } from '../lib/firebase-helpers.js';

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

const REGIONS = ['NA', 'EU', 'OCE', 'Asia', 'SA'];
const FACEIT_DIVISIONS = ['OWCS', 'Masters', 'Advanced', 'Expert', 'Open'];
const SR_OPTIONS = ['Champion 1', 'Champion 2', 'Champion 3', 'Champion 4', 'Champion 5',
  'Grandmaster 1', 'Grandmaster 2', 'Grandmaster 3', 'Grandmaster 4', 'Grandmaster 5',
  'Master 1', 'Master 2', 'Master 3', 'Master 4', 'Master 5',
  'Diamond 1', 'Diamond 2', 'Diamond 3', 'Diamond 4', 'Diamond 5'];

function generateAbbreviation(name) {
  if (!name?.trim()) return '';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return name.substring(0, Math.min(4, name.length)).toUpperCase();
  }
  return words.map(w => w.charAt(0).toUpperCase()).join('');
}

/**
 * Handle /create-team - Create a new team (user must have linked Discord via web)
 */
export async function handleCreateTeamSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString('name');
  const abbreviation = interaction.options.getString('abbreviation') || generateAbbreviation(name);
  const region = interaction.options.getString('region') || 'NA';
  const sr = interaction.options.getString('sr') || 'Champion 1';
  const faceitDiv = interaction.options.getString('faceit-div') || 'Open';

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
      abbreviation: abbreviation.toUpperCase() || generateAbbreviation(name),
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
