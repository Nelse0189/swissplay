import admin from 'firebase-admin';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as discordApi from '../discordApi.js';

function getFirestore() {
  return admin.firestore();
}

export async function handleVerificationConfirm(interaction, verificationCode) {
  if (!verificationCode?.trim()) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    await interaction.followUp?.({ content: '❌ Invalid verification code.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const verificationRef = db.collection('discordVerifications').doc(verificationCode);
  const verificationDoc = await verificationRef.get();
  if (!verificationDoc.exists) {
    await interaction.followUp({ content: '❌ Verification code not found or expired.', ephemeral: true });
    return;
  }
  const data = verificationDoc.data();
  if (data.status === 'confirmed') {
    await interaction.followUp({ content: '✅ This verification has already been confirmed.', ephemeral: true });
    return;
  }
  if (data.status === 'denied') {
    await interaction.followUp({ content: '❌ This verification was denied.', ephemeral: true });
    return;
  }
  const createdAt = data.createdAt?.toDate?.();
  if (createdAt && Date.now() - createdAt.getTime() > 10 * 60 * 1000) {
    await verificationRef.update({ status: 'expired' });
    await interaction.followUp({ content: '❌ This verification has expired.', ephemeral: true });
    return;
  }
  await verificationRef.update({
    status: 'confirmed',
    discordUserId: interaction.user.id,
    confirmedAt: new Date()
  });
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.user.username;

  if (data.teamId && data.userUid) {
    const teamDoc = await db.collection('teams').doc(data.teamId).get();
    if (teamDoc.exists) {
      const team = teamDoc.data();
      const members = team.members || [];
      const idx = members.findIndex(m => m.uid === data.userUid);
      if (idx >= 0) {
        members[idx] = { ...members[idx], discordId: discordUserId, discordUsername };
        await db.collection('teams').doc(data.teamId).update({ members });
      }
    }
  }

  // Profile-level link (Edit Profile): save discordId to users collection (merge in case doc doesn't exist)
  if (data.userUid) {
    await db.collection('users').doc(data.userUid).set({
      discordId: discordUserId,
      discordUsername,
      updatedAt: new Date()
    }, { merge: true });
  }

  console.log('handleVerificationConfirm: about to followUp success');
  await interaction.followUp({ content: '✅ Verification confirmed! Your Discord is now linked.', ephemeral: true });
}

export async function handleVerificationDeny(interaction, verificationCode) {
  if (!verificationCode?.trim()) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    await interaction.followUp?.({ content: '❌ Invalid verification code.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const verificationRef = db.collection('discordVerifications').doc(verificationCode);
  const verificationDoc = await verificationRef.get();
  if (!verificationDoc.exists) {
    await interaction.followUp({ content: '❌ Verification code not found or expired.', ephemeral: true });
    return;
  }
  await verificationRef.update({ status: 'denied', deniedAt: new Date() });
  await interaction.followUp({ content: '❌ Verification denied.', ephemeral: true });
}

export async function handleVerifyDiscordSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const code = interaction.options.getString('code');
  if (!code?.trim()) {
    await interaction.followUp({ content: '❌ Please provide a verification code from the website.', ephemeral: true });
    return;
  }
  const db = getFirestore();
  const verificationRef = db.collection('discordVerifications').doc(code.trim());
  const doc = await verificationRef.get();
  if (!doc.exists) {
    await interaction.followUp({ content: '❌ Invalid or expired verification code.', ephemeral: true });
    return;
  }
  const data = doc.data();
  if (data.status !== 'pending') {
    await interaction.followUp({ content: `❌ This verification is already ${data.status}.`, ephemeral: true });
    return;
  }
  await verificationRef.update({
    status: 'confirmed',
    discordUserId: interaction.user.id,
    confirmedAt: new Date()
  });
  if (data.teamId && data.userUid) {
    const teamDoc = await db.collection('teams').doc(data.teamId).get();
    if (teamDoc.exists) {
      const team = teamDoc.data();
      const members = team.members || [];
      const idx = members.findIndex(m => m.uid === data.userUid);
      if (idx >= 0) {
        members[idx] = { ...members[idx], discordId: interaction.user.id, discordUsername: interaction.user.username };
        await db.collection('teams').doc(data.teamId).update({ members });
      }
    }
  }

  // Profile-level link (Edit Profile): save discordId to users collection
  if (data.userUid) {
    await db.collection('users').doc(data.userUid).set({
      discordId: interaction.user.id,
      discordUsername: interaction.user.username,
      updatedAt: new Date()
    }, { merge: true });
  }

  await interaction.followUp({ content: '✅ Discord verified and linked!', ephemeral: true });
}
