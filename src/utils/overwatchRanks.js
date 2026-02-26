/**
 * Overwatch competitive ranks with divisions 1–5 (5 = lowest, 1 = highest in tier)
 * Used for profile skill rating, free agents, and team matching.
 */
export const OW_RANK_DIVISIONS = [
  { value: '', label: 'Select rank', sr: null },
  // Bronze 0–1499 (300 SR per division)
  { value: '150', label: 'Bronze 5', min: 0, max: 299 },
  { value: '450', label: 'Bronze 4', min: 300, max: 599 },
  { value: '750', label: 'Bronze 3', min: 600, max: 899 },
  { value: '1050', label: 'Bronze 2', min: 900, max: 1199 },
  { value: '1350', label: 'Bronze 1', min: 1200, max: 1499 },
  // Silver 1500–1999 (100 per division)
  { value: '1550', label: 'Silver 5', min: 1500, max: 1599 },
  { value: '1650', label: 'Silver 4', min: 1600, max: 1699 },
  { value: '1750', label: 'Silver 3', min: 1700, max: 1799 },
  { value: '1850', label: 'Silver 2', min: 1800, max: 1899 },
  { value: '1950', label: 'Silver 1', min: 1900, max: 1999 },
  // Gold 2000–2499
  { value: '2050', label: 'Gold 5', min: 2000, max: 2099 },
  { value: '2150', label: 'Gold 4', min: 2100, max: 2199 },
  { value: '2250', label: 'Gold 3', min: 2200, max: 2299 },
  { value: '2350', label: 'Gold 2', min: 2300, max: 2399 },
  { value: '2450', label: 'Gold 1', min: 2400, max: 2499 },
  // Platinum 2500–2999
  { value: '2550', label: 'Platinum 5', min: 2500, max: 2599 },
  { value: '2650', label: 'Platinum 4', min: 2600, max: 2699 },
  { value: '2750', label: 'Platinum 3', min: 2700, max: 2799 },
  { value: '2850', label: 'Platinum 2', min: 2800, max: 2899 },
  { value: '2950', label: 'Platinum 1', min: 2900, max: 2999 },
  // Diamond 3000–3499
  { value: '3050', label: 'Diamond 5', min: 3000, max: 3099 },
  { value: '3150', label: 'Diamond 4', min: 3100, max: 3199 },
  { value: '3250', label: 'Diamond 3', min: 3200, max: 3299 },
  { value: '3350', label: 'Diamond 2', min: 3300, max: 3399 },
  { value: '3450', label: 'Diamond 1', min: 3400, max: 3499 },
  // Master 3500–3999
  { value: '3550', label: 'Master 5', min: 3500, max: 3599 },
  { value: '3650', label: 'Master 4', min: 3600, max: 3699 },
  { value: '3750', label: 'Master 3', min: 3700, max: 3799 },
  { value: '3850', label: 'Master 2', min: 3800, max: 3899 },
  { value: '3950', label: 'Master 1', min: 3900, max: 3999 },
  // Grandmaster 4000–4499
  { value: '4050', label: 'Grandmaster 5', min: 4000, max: 4099 },
  { value: '4150', label: 'Grandmaster 4', min: 4100, max: 4199 },
  { value: '4250', label: 'Grandmaster 3', min: 4200, max: 4299 },
  { value: '4350', label: 'Grandmaster 2', min: 4300, max: 4399 },
  { value: '4450', label: 'Grandmaster 1', min: 4400, max: 4499 },
  // Champion / Top 500 4500+
  { value: '4550', label: 'Champion 5', min: 4500, max: 4599 },
  { value: '4650', label: 'Champion 4', min: 4600, max: 4699 },
  { value: '4750', label: 'Champion 3', min: 4700, max: 4799 },
  { value: '4850', label: 'Champion 2', min: 4800, max: 4899 },
  { value: '4950', label: 'Champion 1', min: 4900, max: 5000 },
];

/** Rank options for dropdowns - reversed order (highest first: Champion 1 → Bronze 5) */
export const OW_RANK_OPTIONS_FOR_DROPDOWN = [
  OW_RANK_DIVISIONS[0], // "Select rank" placeholder first
  ...OW_RANK_DIVISIONS.slice(1).reverse(),
];

/** Get display label for an SR value (e.g. "Diamond 3") */
export const getRankLabel = (sr) => {
  if (sr == null || sr === '') return null;
  const num = typeof sr === 'number' ? sr : parseInt(sr, 10);
  if (isNaN(num)) return null;
  const rank = OW_RANK_DIVISIONS.slice(1).find((r) => num >= r.min && num <= r.max);
  return rank ? rank.label : `${num} SR`;
};

/** Map raw SR to dropdown value (for loading existing data) */
export const getRankValueForSr = (sr) => {
  if (sr == null || sr === '') return '';
  const num = typeof sr === 'number' ? sr : parseInt(sr, 10);
  if (isNaN(num)) return '';
  const rank = OW_RANK_DIVISIONS.slice(1).find((r) => num >= r.min && num <= r.max);
  return rank ? rank.value : String(num);
};

/** Map dropdown value to SR number (for saving) - value is the SR midpoint for the division */
export const getSrForRankValue = (value) => {
  if (!value) return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
};
