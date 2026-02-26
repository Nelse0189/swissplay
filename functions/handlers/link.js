import admin from 'firebase-admin';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getTeamByManagerDiscordId } from '../lib/firebase-helpers.js';
import * as discordApi from '../discordApi.js';

function getFirestore() {
  return admin.firestore();
}

export async function handleLinkDiscordSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const email = interaction.options.getString('email');
  const playerOption = interaction.options.getUser('player');
  if (!email?.trim()) {
    await interaction.followUp({ content: '❌ Missing email. Usage: `/link email:you@example.com`', ephemeral: true });
    return;
  }
  if (!playerOption) {
    await handleSelfLinkOrJoinSlash(interaction, email.trim());
    return;
  }
  const team = await getTeamByManagerDiscordId(interaction.user.id);
  if (!team) {
    await interaction.followUp({ content: '❌ You are not a manager of any team.', ephemeral: true });
    return;
  }
  const member = team.members?.find(m => m.email === email || m.email?.toLowerCase() === email.toLowerCase());
  if (!member) {
    await interaction.followUp({ content: `❌ No team member found with email: ${email}`, ephemeral: true });
    return;
  }
  const teamRef = db.collection('teams').doc(team.id);
  const updatedMembers = team.members.map(m =>
    m.uid === member.uid ? { ...m, discordId: playerOption.id, discordUsername: playerOption.username } : m
  );
  let managerDiscordIds = team.managerDiscordIds || [];
  if ((member.roles?.includes('Manager') || member.roles?.includes('Owner')) && !managerDiscordIds.includes(playerOption.id)) {
    managerDiscordIds.push(playerOption.id);
  }
  await teamRef.update({ members: updatedMembers, managerDiscordIds });
  const embed = new EmbedBuilder()
    .setTitle('✅ Discord Account Linked')
    .setDescription(`Linked ${playerOption.username} to ${member.name || email}`)
    .setColor(0x00ff00);
  await interaction.followUp({ embeds: [embed], ephemeral: true });
}

async function handleSelfLinkOrJoinSlash(interaction, email) {
  const db = getFirestore();
  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.followUp({ content: '❌ This command must be run in a server (not in DMs).', ephemeral: true });
    return;
  }
  const teamsSnapshot = await db.collection('teams').get();
  const matchingTeams = teamsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => t.discordGuildId === guildId && t.members?.some(m => m.email?.toLowerCase() === email.toLowerCase()));
  if (matchingTeams.length === 0) {
    await interaction.followUp({ content: `❌ No team in this server has a member with email: ${email}`, ephemeral: true });
    return;
  }
  if (matchingTeams.length === 1) {
    const team = matchingTeams[0];
    const member = team.members.find(m => m.email?.toLowerCase() === email.toLowerCase());
    if (member?.discordId === interaction.user.id) {
      await interaction.followUp({ content: '✅ Your Discord is already linked to this team.', ephemeral: true });
      return;
    }
    const updatedMembers = team.members.map(m =>
      m.uid === member.uid ? { ...m, discordId: interaction.user.id, discordUsername: interaction.user.username } : m
    );
    await db.collection('teams').doc(team.id).update({ members: updatedMembers });
    await interaction.followUp({ content: `✅ Linked your Discord to **${team.name}**!`, ephemeral: true });
    return;
  }
  const sessionCode = Math.random().toString(36).slice(2, 10);
  await db.collection('discordLinkSessions').doc(sessionCode).set({
    userId: interaction.user.id,
    email,
    guildId,
    teamIds: matchingTeams.map(t => t.id),
    createdAt: new Date()
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`join_team_${sessionCode}`)
    .setPlaceholder('Choose which team to join')
    .addOptions(matchingTeams.slice(0, 25).map(t => ({ label: (t.name || t.id).slice(0, 100), value: t.id })));
  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.followUp({
    content: `Select which team to link your Discord to:`,
    components: [row],
    ephemeral: true
  });
}

export async function handleJoinTeamSelect(interaction, sessionCode, selectedTeamId) {
  await interaction.update({ content: '⏳ Linking you to the selected team...', components: [] });
  const db = getFirestore();
  const sessionRef = db.collection('discordLinkSessions').doc(sessionCode);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    await interaction.followUp({ content: '❌ Session expired. Please run `/link` again.', ephemeral: true });
    return;
  }
  const session = sessionDoc.data();
  if (session.userId !== interaction.user.id) {
    await interaction.followUp({ content: '❌ This session is not for your account.', ephemeral: true });
    return;
  }
  if (!selectedTeamId || !session.teamIds?.includes(selectedTeamId)) {
    await interaction.followUp({ content: '❌ Invalid team selection.', ephemeral: true });
    return;
  }
  const teamDoc = await db.collection('teams').doc(selectedTeamId).get();
  if (!teamDoc.exists) {
    await interaction.followUp({ content: '❌ Team not found.', ephemeral: true });
    return;
  }
  const team = { id: teamDoc.id, ...teamDoc.data() };
  const member = team.members?.find(m => m.email?.toLowerCase() === session.email?.toLowerCase());
  if (!member) {
    await interaction.followUp({ content: '❌ Member not found in team.', ephemeral: true });
    return;
  }
  const updatedMembers = team.members.map(m =>
    m.uid === member.uid ? { ...m, discordId: interaction.user.id, discordUsername: interaction.user.username } : m
  );
  await db.collection('teams').doc(team.id).update({ members: updatedMembers });
  await sessionRef.delete();
  await interaction.followUp({ content: `✅ Linked your Discord to **${team.name}**!`, ephemeral: true });
}
