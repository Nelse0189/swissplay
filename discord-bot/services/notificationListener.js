/**
 * Firestore listener for notifications - DMs users with Discord linked
 * when they receive lft_invite or ringer_invite notifications
 */
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFirestore } from '../firebase/config.js';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://solaris-cd166.web.app';

export function setupNotificationListener(client) {
  try {
    const db = getFirestore();
    if (!db) {
      console.error('❌ Firestore not available, skipping notification listener');
      return;
    }

    const notificationsRef = db.collection('notifications');
    console.log('👂 Setting up Firestore listener for notifications (lft_invite)...');

    notificationsRef.onSnapshot(async (snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        if (change.type !== 'added') continue;

        const notifDoc = change.doc;
        const notifId = notifDoc.id;
        const data = notifDoc.data();

        if (data.discordDMSent) continue;
        if (data.type !== 'lft_invite') continue;

        const userId = data.userId;
        if (!userId) continue;

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) continue;

        const userData = userDoc.data();
        const discordId = userData.discordId;
        if (!discordId) continue;

        setTimeout(async () => {
          try {
            const discordUser = await client.users.fetch(discordId);
            const actionData = data.actionData || {};

            const embed = new EmbedBuilder()
              .setTitle('🏆 Team Invitation')
              .setColor(0x57F287)
              .setDescription(data.message || `${actionData.teamName} has invited you to join their team!`)
              .addFields(
                { name: 'Team', value: actionData.teamName || 'Unknown', inline: true },
                { name: 'Invited by', value: actionData.managerName || 'A manager', inline: true }
              )
              .setFooter({ text: `Accept or decline below, or check your inbox at ${WEBSITE_URL}` })
              .setTimestamp();

            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`lft_accept_${notifId}`)
                  .setLabel('Accept')
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`lft_decline_${notifId}`)
                  .setLabel('Decline')
                  .setStyle(ButtonStyle.Danger)
              );

            await discordUser.send({ embeds: [embed], components: [row] });

            await notificationsRef.doc(notifId).update({
              discordDMSent: true,
              discordDMSentAt: new Date(),
            });
            console.log(`✅ LFT invite DM sent to ${discordId} for notification ${notifId}`);
          } catch (error) {
            console.error(`❌ Failed to send LFT invite DM for ${notifId}:`, error.message);
          }
        }, 1000);
      }
    });

    console.log('✅ Notification listener active');
  } catch (error) {
    console.error('❌ Failed to setup notification listener:', error.message);
  }
}
