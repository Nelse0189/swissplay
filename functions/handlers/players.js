import admin from 'firebase-admin';
import { EmbedBuilder } from 'discord.js';
import { getManagerTeams, getPlayerByDiscordId } from '../lib/firebase-helpers.js';
import * as discordApi from '../discordApi.js';

function getFirestore() {
  return admin.firestore();
}

async function addPlayerToTeam(db, team, user) {
  const existing = team.members?.find(m => m.discordId === user.id);
  if (existing) throw new Error('Player is already on this team.');
  const newMember = {
    discordId: user.id,
    discordUsername: user.username,
    name: user.globalName || user.username,
    roles: ['Player'],
    availability: [],
    availabilityText: 'Not set'
  };
  await db.collection('teams').doc(team.id).update({
    members: [...(team.members || []), newMember]
  });
}

export async function handleRemovePlayerSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const managerTeams = await getManagerTeams(db, interaction.user.id);
  if (managerTeams.length === 0) {
    await interaction.followUp({ content: '❌ You are not a verified manager.', ephemeral: true });
    return;
  }
  const playerUser = interaction.options.getUser('player');
  if (!playerUser) {
    await interaction.followUp({ content: '❌ Please specify a player.', ephemeral: true });
    return;
  }
  const team = managerTeams.find(t => t.members?.some(m => m.discordId === playerUser.id));
  if (!team) {
    await interaction.followUp({ content: `❌ ${playerUser.username} is not on any of your teams.`, ephemeral: true });
    return;
  }
  const updatedMembers = team.members.filter(m => m.discordId !== playerUser.id);
  await db.collection('teams').doc(team.id).update({ members: updatedMembers });
  await interaction.followUp({
    content: `✅ Removed ${playerUser.username} from **${team.name}**.`,
    ephemeral: true
  });
}

export async function handleListPlayersSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const managerTeams = await getManagerTeams(db, interaction.user.id);
  if (managerTeams.length === 0) {
    await interaction.followUp({ content: '❌ You are not a verified manager.', ephemeral: true });
    return;
  }
  const team = managerTeams[0];
  const players = team.members?.filter(m => m.roles?.includes('Player') || m.roles?.includes('Coach')) || [];
  const lines = players.map(m => `• ${m.discordUsername || m.name || 'Unknown'} ${m.discordId ? '✅ Linked' : '❌ Not linked'}`);
  const embed = new EmbedBuilder()
    .setTitle(`👥 ${team.name} - Players`)
    .setDescription(lines.join('\n') || 'No players')
    .setColor(0x00ff00);
  await interaction.followUp({ embeds: [embed], ephemeral: true });
}

export async function handleMyTeamSlash(interaction) {
  await interaction.reply({ content: '👥 Check your DMs! I sent you your team info.', ephemeral: true });
  const user = interaction.user;
  const db = getFirestore();
  const teamsSnapshot = await db.collection('teams').get();
  const userTeams = teamsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => t.members?.some(m => m.discordId === user.id));
  if (userTeams.length === 0) {
    await discordApi.sendDM(user.id, {
      embeds: [discordApi.embedToApi(new EmbedBuilder()
        .setTitle('❌ Not on a Team')
        .setDescription('You\'re not on any team. Ask a manager to add you with `/add-player`.')
        .setColor(0xff0000))]
    });
    return;
  }
  for (const team of userTeams) {
    const myMember = team.members.find(m => m.discordId === user.id);
    const rosterText = team.members.map(m => `• ${m.discordUsername || m.name || 'Unknown'} ${m.discordId === user.id ? '(You)' : ''}`).join('\n').slice(0, 1000);
    const embed = new EmbedBuilder()
      .setTitle(`👥 ${team.name || 'Your Team'}`)
      .addFields(
        { name: 'Your Availability', value: myMember?.availabilityText || 'Not set', inline: false },
        { name: 'Team Roster', value: rosterText || 'No members', inline: false }
      )
      .setColor(0x00ff00);
    await discordApi.sendDM(user.id, { embeds: [discordApi.embedToApi(embed)] });
  }
}

export async function handleTeamStatsSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const managerTeams = await getManagerTeams(db, interaction.user.id);
  if (managerTeams.length === 0) {
    await interaction.followUp({ content: '❌ You are not a verified manager.', ephemeral: true });
    return;
  }
  const team = managerTeams[0];
  const withAvail = team.members?.filter(m => m.availabilityText && m.availabilityText !== 'Not set').length || 0;
  const total = team.members?.length || 1;
  const pct = Math.round((withAvail / total) * 100);
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${team.name} - Stats`)
    .addFields(
      { name: 'Team Size', value: `${total}`, inline: true },
      { name: 'With Availability Set', value: `${withAvail} (${pct}%)`, inline: true }
    )
    .setColor(0x00ff00);
  await interaction.followUp({ embeds: [embed], ephemeral: true });
}
