import admin from 'firebase-admin';

function getFirestore() {
  return admin.firestore();
}

export async function getTeamByManagerDiscordId(discordId) {
  const db = getFirestore();
  try {
    const teamsRef = db.collection('teams');
    try {
      const optimizedSnapshot = await teamsRef.where('managerDiscordIds', 'array-contains', discordId).limit(1).get();
      if (!optimizedSnapshot.empty) {
        const teamDoc = optimizedSnapshot.docs[0];
        const teamData = teamDoc.data();
        return { id: teamDoc.id, ...teamData, members: teamData.members || [] };
      }
    } catch (_) {}
    const snapshot = await teamsRef.get();
    for (const doc of snapshot.docs) {
      const team = { id: doc.id, ...doc.data() };
      if (!team.members?.length) continue;
      const manager = team.members.find(m => m.discordId === discordId && m.roles && (m.roles.includes('Manager') || m.roles.includes('Owner')));
      if (manager) return team;
    }
    return null;
  } catch (error) {
    console.error('getTeamByManagerDiscordId:', error);
    throw error;
  }
}

export async function getManagerTeams(db, discordId) {
  try {
    const teamMap = new Map();
    const discordIdStr = String(discordId);

    // Run the managerDiscordIds query and users query in parallel
    const [byManagerDiscord, usersSnapshot] = await Promise.all([
      db.collection('teams').where('managerDiscordIds', 'array-contains', discordIdStr).get(),
      db.collection('users').where('discordId', '==', discordIdStr).get(),
    ]);

    byManagerDiscord.docs.forEach(d => teamMap.set(d.id, { id: d.id, ...d.data() }));

    // For each user found, look up their owned teams — run all in parallel
    const ownerQueries = usersSnapshot.docs.map(userDoc =>
      db.collection('teams').where('ownerId', '==', userDoc.id).get()
    );
    const ownerResults = await Promise.all(ownerQueries);
    for (const snap of ownerResults) {
      for (const d of snap.docs) {
        const team = { id: d.id, ...d.data() };
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
