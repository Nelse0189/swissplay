/**
 * /set-summary-channel, /set-reminder-channel
 *
 * Configures automated event summaries and channel-based reminders
 * for team calendar events from the SwissPlay website.
 */
import { EmbedBuilder } from 'discord.js';
import admin from 'firebase-admin';
import { getManagerTeams } from '../lib/firebase-helpers.js';

function getFirestore() {
  return admin.firestore();
}

// ---- /set-summary-channel ----

export async function handleSetSummaryChannelSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const discordId = interaction.user.id;
  const channel = interaction.options.getChannel('channel');
  const frequency = interaction.options.getString('frequency');

  try {
    const teams = await getManagerTeams(db, discordId);
    if (teams.length === 0) {
      await interaction.editReply({ content: '❌ You must be a verified Manager or Owner.' });
      return;
    }

    const team = teams[0];

    if (frequency === 'off') {
      await db.collection('teams').doc(team.id).update({
        summaryChannelId: null,
        summaryFrequency: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await interaction.editReply({ content: '✅ Automatic event summaries disabled.' });
      return;
    }

    const channelId = channel?.id;
    if (!channelId) {
      await interaction.editReply({ content: '❌ Please specify a channel.' });
      return;
    }

    await db.collection('teams').doc(team.id).update({
      summaryChannelId: channelId,
      summaryFrequency: frequency,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const freqLabel = frequency === 'daily' ? 'every morning at 9 AM UTC' : 'every Monday at 9 AM UTC';

    const embed = new EmbedBuilder()
      .setTitle('📋 Event Summaries Configured')
      .setColor(0x57F287)
      .addFields(
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
        { name: 'Frequency', value: frequency === 'daily' ? 'Daily' : 'Weekly', inline: true },
        { name: 'Schedule', value: freqLabel, inline: false }
      )
      .setFooter({ text: 'Summaries include all team calendar events for the upcoming period.' });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in set-summary-channel:', error);
    await interaction.editReply({ content: `❌ Failed: ${error.message}` });
  }
}

// ---- /set-reminder-channel ----

export async function handleSetReminderChannelSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = getFirestore();
  const discordId = interaction.user.id;
  const channel = interaction.options.getChannel('channel');

  try {
    const teams = await getManagerTeams(db, discordId);
    if (teams.length === 0) {
      await interaction.editReply({ content: '❌ You must be a verified Manager or Owner.' });
      return;
    }

    const team = teams[0];

    if (!channel) {
      await db.collection('teams').doc(team.id).update({
        reminderChannelId: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await interaction.editReply({ content: '✅ Channel-based event reminders disabled. DM reminders still active.' });
      return;
    }

    await db.collection('teams').doc(team.id).update({
      reminderChannelId: channel.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const embed = new EmbedBuilder()
      .setTitle('🔔 Reminder Channel Set')
      .setColor(0x57F287)
      .setDescription(`Event reminders will now also be posted in <#${channel.id}>.`)
      .addFields(
        { name: 'Reminder Schedule', value: '15 min, 1 hour, and 24 hours before events', inline: false },
        { name: 'DM Reminders', value: 'Still active — players get both DM and channel reminders.', inline: false }
      );

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in set-reminder-channel:', error);
    await interaction.editReply({ content: `❌ Failed: ${error.message}` });
  }
}

