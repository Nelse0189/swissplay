/**
 * Find Scrims matching logic (aligned with src/pages/FindScrims.jsx).
 */

const TIERS = ['Champion', 'Grandmaster', 'Master', 'Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze'];

export function rankToSr(srOrRank) {
  if (srOrRank == null || srOrRank === '') return null;
  if (typeof srOrRank === 'number' && !Number.isNaN(srOrRank)) return srOrRank;
  const str = String(srOrRank).trim();
  const match = str.match(/^(Champion|Grandmaster|Master|Diamond|Platinum|Gold|Silver|Bronze)\s*(\d)$/i);
  if (!match) return null;
  const [, tier, div] = match;
  const tierOrder = TIERS.map((t) => t.toLowerCase()).indexOf(tier.toLowerCase());
  const divNum = parseInt(div, 10);
  if (tierOrder < 0 || divNum < 1 || divNum > 5) return null;
  const rankIndex = tierOrder * 5 + (divNum - 1);
  const minSr = 500;
  const maxSr = 4500;
  return Math.round(maxSr - (rankIndex / 39) * (maxSr - minSr));
}

function slotKey(day, hour) {
  return `${day}-${Number(hour)}`;
}

export function getMatchScore(myTeam, otherTeam) {
  let score = 0;
  const weights = { reliability: 25, rank: 25, schedule: 30, region: 20 };

  if (myTeam.region && otherTeam.region) {
    score += myTeam.region === otherTeam.region ? weights.region : 0;
  } else {
    score += weights.region / 2;
  }

  const myRel = myTeam.reliabilityScore ?? 100;
  const theirRel = otherTeam.reliabilityScore ?? 100;
  const relDiff = Math.abs(myRel - theirRel);
  score += Math.max(0, weights.reliability - (relDiff / 15) * weights.reliability);

  const mySr = rankToSr(myTeam.sr) ?? 3000;
  const theirSr = rankToSr(otherTeam.sr) ?? 3000;
  const srDiff = Math.abs(mySr - theirSr);
  score += Math.max(0, weights.rank - (srDiff / 500) * weights.rank);

  const mySlots = new Set((myTeam.schedule || []).map((s) => slotKey(s.day, s.hour)));
  const theirSlots = otherTeam.schedule || [];
  const overlapCount = theirSlots.filter((s) => mySlots.has(slotKey(s.day, s.hour))).length;
  const minSlots = Math.max(1, Math.min(mySlots.size, theirSlots.length));
  score += (overlapCount / minSlots) * weights.schedule;

  return Math.round(Math.min(100, score));
}

/**
 * @param {object} opts
 * @param {Array} opts.allTeams - full team list (each has id, schedule, etc.)
 * @param {string} opts.myTeamId
 * @param {object} opts.filters - { division, region, timezone, day } use 'All' to skip
 */
export function findMatchingTeams({ allTeams, myTeamId, filters }) {
  const myTeam = allTeams.find((t) => t.id === myTeamId);
  if (!myTeam || !myTeam.schedule?.length) return [];

  const mySlots = new Set(myTeam.schedule.map((s) => slotKey(s.day, s.hour)));
  const { division: divisionFilter, region: regionFilter, timezone: timezoneFilter, day: dayFilter } = filters;

  return allTeams.filter((team) => {
    if (team.id === myTeamId) return false;
    if (!team.schedule?.length) return false;

    if (divisionFilter !== 'All' && team.faceitDiv !== divisionFilter) return false;
    if (regionFilter !== 'All' && team.region !== regionFilter) return false;
    if (timezoneFilter !== 'All') {
      const teamTz = team.scheduleTimezone || 'America/New_York';
      if (teamTz !== timezoneFilter) return false;
    }
    if (dayFilter !== 'All') {
      const hasDayAvailability = team.schedule.some((s) => s.day === dayFilter);
      if (!hasDayAvailability) return false;
    }

    const hasOverlap = team.schedule.some((slot) => mySlots.has(slotKey(slot.day, slot.hour)));
    if (dayFilter !== 'All') {
      return team.schedule.some((slot) => {
        return slot.day === dayFilter && mySlots.has(slotKey(slot.day, slot.hour));
      });
    }
    return hasOverlap;
  });
}

export function getMatchingSlots(myTeam, otherTeam, dayFilter) {
  if (!myTeam?.schedule?.length) return [];
  const mySlots = new Set(myTeam.schedule.map((s) => slotKey(s.day, s.hour)));
  let matches = otherTeam.schedule.filter((slot) => mySlots.has(slotKey(slot.day, slot.hour)));
  if (dayFilter !== 'All') {
    matches = matches.filter((slot) => slot.day === dayFilter);
  }
  return matches;
}

export function isSlotLockedForTeam(requests, teamId, slot) {
  return requests.some((req) => {
    const matchesSlot = req.slot?.day === slot.day && Number(req.slot?.hour) === Number(slot.hour);
    const isActive = req.status === 'pending' || req.status === 'accepted';
    if (!matchesSlot || !isActive) return false;
    return req.fromTeamId === teamId || req.toTeamId === teamId;
  });
}

export function getRequestStatusForSlot(requests, myTeamId, targetTeamId, slot) {
  const request = requests.find((req) => {
    const pair =
      (req.fromTeamId === myTeamId && req.toTeamId === targetTeamId) ||
      (req.fromTeamId === targetTeamId && req.toTeamId === myTeamId);
    return pair && req.slot.day === slot.day && Number(req.slot.hour) === Number(slot.hour);
  });
  return request ? request.status : null;
}

export function getTimezoneAbbrev(date, ianaTimezone = 'America/New_York') {
  if (!ianaTimezone || ianaTimezone === 'UTC') return 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaTimezone,
      timeZoneName: 'short',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : ianaTimezone;
  } catch {
    return ianaTimezone;
  }
}

/** Short label for a slot in the opponent's schedule timezone */
export function formatSlotLine(slot, opponentTeam) {
  const iana = opponentTeam?.scheduleTimezone || 'America/New_York';
  const h = Number(slot.hour);
  const m = Number(slot.minute ?? 0);
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const idx = days.indexOf(slot.day);
  if (idx === -1) return `${slot.day} ${h}:${String(m).padStart(2, '0')}`;

  let daysUntil = idx - now.getDay();
  if (daysUntil < 0) daysUntil += 7;
  else if (daysUntil === 0 && (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m))) {
    daysUntil += 7;
  }
  const d = new Date(now);
  d.setDate(now.getDate() + daysUntil);
  d.setHours(h, m, 0, 0);
  const tz = getTimezoneAbbrev(d, iana);
  const dayShort = slot.day.slice(0, 3);
  const timeStr =
    m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, '0')}`;
  return `${dayShort} ${timeStr} ${tz}`;
}
