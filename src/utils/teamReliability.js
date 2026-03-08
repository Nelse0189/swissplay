import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';

export const RELIABILITY_DEFAULT = 100;

export const updateTeamReliability = async (teamId, delta) => {
  if (!teamId) return;
  try {
    await runTransaction(db, async (transaction) => {
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await transaction.get(teamRef);
      const current = teamSnap.exists() ? (teamSnap.data().reliabilityScore ?? RELIABILITY_DEFAULT) : RELIABILITY_DEFAULT;
      const next = Math.max(0, Math.min(100, current + delta));
      transaction.update(teamRef, { reliabilityScore: next });
    });
  } catch (err) {
    console.error('Failed to update team reliability:', err);
  }
};
