import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFirestore } from '../firebase/config.js';
import { getTeamByManagerDiscordId } from '../utils/firebase-helpers.js';

const RELIABILITY_DEFAULT = 100;

async function updateTeamReliability(db, teamId, delta) {
  if (!teamId) return;
  const teamRef = db.collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();
  const current = teamDoc.exists ? (teamDoc.data().reliabilityScore ?? RELIABILITY_DEFAULT) : RELIABILITY_DEFAULT;
  const next = Math.max(0, Math.min(100, current + delta));
  await teamRef.update({ reliabilityScore: next });
}

/**
 * Handle /submit-review - Manager submits a team review after a scrim
 */
export async function handleSubmitReviewSlash(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const rating = interaction.options.getInteger('rating');
  const comment = interaction.options.getString('comment');

  const db = getFirestore();

  try {
    const myTeam = await getTeamByManagerDiscordId(interaction.user.id);
    if (!myTeam) {
      await interaction.editReply({
        content: '❌ You must be a Manager or Owner to submit reviews.',
        ephemeral: true,
      });
      return;
    }

    // Find recent accepted scrims (past) that my team participated in
    const requestsSnapshot = await db.collection('scrimRequests')
      .where('status', '==', 'accepted')
      .get();

    const now = new Date();
    const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const myScrims = requestsSnapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => (r.fromTeamId === myTeam.id || r.toTeamId === myTeam.id) && r.slot?.day)
      .map((r) => {
        const slot = r.slot;
        const created = r.createdAt?.toDate?.() || new Date(r.createdAt);
        const targetDayIndex = DAYS_OF_WEEK.indexOf(slot.day);
        let daysUntilTarget = targetDayIndex - created.getDay();
        if (daysUntilTarget < 0) daysUntilTarget += 7;

        const scrimDate = new Date(created);
        scrimDate.setDate(created.getDate() + daysUntilTarget);
        scrimDate.setHours(slot.hour || 0, 0, 0, 0);

        const oppTeamId = r.fromTeamId === myTeam.id ? r.toTeamId : r.fromTeamId;
        const oppTeamName = r.fromTeamId === myTeam.id ? r.toTeamName : r.fromTeamName;
        return {
          ...r,
          scrimDate,
          oppTeamId,
          oppTeamName,
        };
      })
      .filter((r) => r.scrimDate < now)
      .sort((a, b) => b.scrimDate - a.scrimDate)
      .slice(0, 25);

    if (myScrims.length === 0) {
      await interaction.editReply({
        content: '❌ No completed scrims found to review.',
        ephemeral: true,
      });
      return;
    }

    const sessionId = `rev_${Date.now()}_${interaction.user.id}`;
    await db.collection('submitReviewSessions').doc(sessionId).set({
      managerId: interaction.user.id,
      teamId: myTeam.id,
      rating,
      comment: comment?.trim() || null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const options = myScrims.map((r) => ({
      label: `${r.oppTeamName} - ${r.scrimDate.toLocaleDateString()}`,
      value: `${r.oppTeamId}_${r.id}`,
      description: r.oppTeamName,
    }));

    const select = new StringSelectMenuBuilder()
      .setCustomId(`submit_review_${sessionId}`)
      .setPlaceholder('Select scrim to review...')
      .addOptions(options);

    await interaction.editReply({
      content: `Select the scrim you want to rate (${rating} stars):`,
      components: [new ActionRowBuilder().addComponents(select)],
    });
  } catch (error) {
    console.error('Error in submit-review:', error);
    await interaction.editReply({
      content: `❌ Failed: ${error.message}`,
      ephemeral: true,
    });
  }
}

/**
 * Handle submit_review select - create the review
 */
export async function handleSubmitReviewSelect(interaction, customId) {
  if (!customId.startsWith('submit_review_')) return false;
  const sessionId = customId.replace('submit_review_', '');
  const value = interaction.values?.[0];
  if (!value) return false;

  const [oppTeamId, requestId] = value.split('_');
  if (!oppTeamId || !requestId) return false;

  const db = getFirestore();

  try {
    const sessionRef = db.collection('submitReviewSessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists || sessionDoc.data().managerId !== interaction.user.id) {
      await interaction.update({ content: '❌ Session expired. Run /submit-review again.', components: [] });
      return true;
    }

    const session = sessionDoc.data();
    const { rating, comment, teamId: fromTeamId } = session;

    const existingQuery = await db.collection('teamReviews')
      .where('teamId', '==', oppTeamId)
      .where('fromTeamId', '==', fromTeamId)
      .where('scrimRequestId', '==', requestId)
      .get();

    if (!existingQuery.empty) {
      await interaction.update({ content: '❌ You have already reviewed this scrim.', components: [] });
      await sessionRef.delete().catch(() => {});
      return true;
    }

    const fromTeamDoc = await db.collection('teams').doc(fromTeamId).get();
    const fromTeamName = fromTeamDoc.exists ? fromTeamDoc.data().name : 'Unknown';

    const reviewRef = await db.collection('teamReviews').add({
      teamId: oppTeamId,
      fromTeamId,
      fromTeamName,
      rating,
      comment: comment || null,
      createdAt: new Date(),
      scrimRequestId: requestId,
    });

    const oppTeamDoc = await db.collection('teams').doc(oppTeamId).get();
    const oppTeam = oppTeamDoc.data() || {};

    if (oppTeam.members) {
      for (const m of oppTeam.members) {
        if (m.roles?.includes('Manager') || m.roles?.includes('Owner')) {
          if (m.uid) {
            await db.collection('notifications').add({
              userId: m.uid,
              type: 'review',
              title: 'New Team Review',
              message: `${fromTeamName} left a ${rating}-star review for your team.`,
              actionData: { teamId: oppTeamId, reviewId: reviewRef.id },
              read: false,
              createdAt: new Date(),
            });
          }
        }
      }
    }

    const deltaMap = { 1: -5, 2: -2, 3: 0, 4: 2, 5: 5 };
    const delta = deltaMap[rating] || 0;
    if (delta !== 0) {
      await updateTeamReliability(db, oppTeamId, delta);
    }

    await sessionRef.delete().catch(() => {});

    await interaction.update({
      content: `✅ Review submitted! ${rating} stars for the opponent.`,
      components: [],
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    await interaction.update({
      content: `❌ Failed: ${error.message}`,
      components: [],
    });
  }

  return true;
}
