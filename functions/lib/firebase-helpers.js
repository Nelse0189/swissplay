import admin from 'firebase-admin';

function getFirestore() {
  return admin.firestore();
}

/** Discord IDs on the team roster — used for `array-contains` lookups (no full collection scans). */
export function syncMemberDiscordIdsFromMembers(members = []) {
  const ids = new Set();
  for (const m of members || []) {
    if (m?.discordId != null && m.discordId !== '') ids.add(String(m.discordId));
  }
  return [...ids];
}

/**
 * Teams this Discord user is on (member with discordId). Uses memberDiscordIds index when present.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} discordUserId
 * @param {string|null} guildId - if set, prefer teams linked to this guild
 */
export async function getTeamsForDiscordMember(db, discordUserId, guildId = null) {
  const did = String(discordUserId);
  let snap;
  try {
    snap = await db.collection('teams').where('memberDiscordIds', 'array-contains', did).get();
  } catch (e) {
    console.warn('getTeamsForDiscordMember: indexed query failed:', e.message);
    snap = { docs: [], empty: true };
  }
  let teams = snap.docs.map(d => ({ id: d.id, ...d.data(), members: d.data().members || [] }));

  if (teams.length === 0) {
    const all = await db.collection('teams').get();
    teams = all.docs
      .map(doc => ({ id: doc.id, ...doc.data(), members: doc.data().members || [] }))
      .filter(t => t.members?.some(m => String(m.discordId) === did));
  }
  if (guildId && teams.length > 0) {
    teams = teams.filter(t => !t.discordGuildId || String(t.discordGuildId) === String(guildId));
  }

  return teams;
}

/** Teams this Discord user can manage (managerDiscordIds or Firestore owner). Excludes deprecated teams (same as the website). */
export async function getManagerTeams(db, discordId) {
  try {
    const teamMap = new Map();
    const discordIdStr = String(discordId);

    // Run the managerDiscordIds query and users query in parallel
    const [byManagerDiscord, usersSnapshot] = await Promise.all([
      db.collection('teams').where('managerDiscordIds', 'array-contains', discordIdStr).get(),
      db.collection('users').where('discordId', '==', discordIdStr).get(),
    ]);

    byManagerDiscord.docs.forEach(d => {
      const data = d.data();
      if (data.deprecated) return;
      teamMap.set(d.id, { id: d.id, ...data });
    });

    // For each user found, look up their owned teams — run all in parallel
    const ownerQueries = usersSnapshot.docs.map(userDoc =>
      db.collection('teams').where('ownerId', '==', userDoc.id).get()
    );
    const ownerResults = await Promise.all(ownerQueries);
    for (const snap of ownerResults) {
      for (const d of snap.docs) {
        const team = { id: d.id, ...d.data() };
        if (team.deprecated) continue;
        teamMap.set(d.id, team);
        // Backfill managerDiscordIds so future lookups skip the users query entirely
        const mids = team.managerDiscordIds || [];
        if (!mids.some(id => String(id) === discordIdStr)) {
          db.collection('teams').doc(d.id).update({
            managerDiscordIds: [...mids, discordIdStr]
          }).catch(() => {});
        }
      }
    }

    return Array.from(teamMap.values());
  } catch (error) {
    console.error('getManagerTeams:', error);
    return [];
  }
}

/** First team where this Discord user is Manager/Owner (parallel queries; avoids full collection scan). */
export async function getTeamByManagerDiscordId(discordId) {
  const db = getFirestore();
  const discordIdStr = String(discordId);
  try {
    const teams = await getManagerTeams(db, discordIdStr);
    if (!teams.length) return null;
    const asManager = teams.find(
      t =>
        t.members?.some(
          m =>
            String(m.discordId) === discordIdStr &&
            m.roles &&
            (m.roles.includes('Manager') || m.roles.includes('Owner'))
        )
    );
    return asManager || teams[0];
  } catch (error) {
    console.error('getTeamByManagerDiscordId:', error);
    throw error;
  }
}

/** Auto-link team to Discord server when a manager runs a command. No-op if already linked or no guildId.
 *  Also backfills discordGuildId on existing calendar events so they sync to Discord. */
export async function ensureTeamLinkedToGuild(db, teamId, guildId) {
  if (!guildId || !teamId) return;
  try {
    const ref = db.collection('teams').doc(teamId);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.discordGuildId) return;
    await ref.update({ discordGuildId: guildId });

    // Backfill calendar events: add discordGuildId to events created before team was linked
    try {
      const eventsSnapshot = await db.collection('calendarEvents')
        .where('teamId', '==', teamId)
        .get();
      for (const ev of eventsSnapshot.docs) {
        if (!ev.data()?.discordGuildId) {
          await ev.ref.update({ discordGuildId: guildId, updatedAt: new Date() });
        }
      }
    } catch (e2) {
      console.warn('ensureTeamLinkedToGuild: calendar backfill failed:', e2.message);
    }
  } catch (e) {
    console.warn('ensureTeamLinkedToGuild:', e.message);
  }
}

export async function getPlayerByDiscordId(discordId, teamId) {
  const db = getFirestore();
  const teamDoc = await db.collection('teams').doc(teamId).get();
  if (!teamDoc.exists) return null;
  const team = { id: teamDoc.id, ...teamDoc.data() };
  return team.members?.find(m => m.discordId === discordId) || null;
}

export async function getUserByDiscordId(discordId) {
  const db = getFirestore();
  try {
    const snapshot = await db.collection('users')
      .where('discordId', '==', discordId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { uid: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error in getUserByDiscordId:', error);
    return null;
  }
}

/** All teams (for scrim discovery, etc.) */
export async function getAllTeams() {
  const db = getFirestore();
  const snapshot = await db.collection('teams').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
