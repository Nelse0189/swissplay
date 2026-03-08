// Overwatch 2 competitive ranks (Champion → Bronze), each tier 1–5.
// Used for team "average rank" dropdown; order is high to low for UX.
const tiers = ['Champion', 'Grandmaster', 'Master', 'Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze'];
const divisions = [1, 2, 3, 4, 5];

export const OVERWATCH_RANK_OPTIONS = tiers.flatMap((tier) =>
  divisions.map((div) => ({
    value: `${tier} ${div}`,
    label: `${tier} ${div}`,
  }))
);

// Map rank label to approximate SR for matchmaking (FindScrims). Handles legacy numeric sr.
export function rankToSr(srOrRank) {
  if (srOrRank == null || srOrRank === '') return null;
  if (typeof srOrRank === 'number' && !Number.isNaN(srOrRank)) return srOrRank;
  const str = String(srOrRank).trim();
  const match = str.match(/^(Champion|Grandmaster|Master|Diamond|Platinum|Gold|Silver|Bronze)\s*(\d)$/i);
  if (!match) return null;
  const [, tier, div] = match;
  const tierOrder = tiers.map((t) => t.toLowerCase()).indexOf(tier.toLowerCase());
  const divNum = parseInt(div, 10);
  if (tierOrder < 0 || divNum < 1 || divNum > 5) return null;
  // Approximate SR: Champion 1 ≈ 4500, Bronze 5 ≈ 500. Division 1 = highest in tier.
  const rankIndex = tierOrder * 5 + (divNum - 1); // 0 = Champion 1, 39 = Bronze 5
  const minSr = 500;
  const maxSr = 4500;
  return Math.round(maxSr - (rankIndex / 39) * (maxSr - minSr));
}
