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
    const snapshot = await db.collection('teams').where('managerDiscordIds', 'array-contains', discordId).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('getManagerTeams:', error);
    return [];
  }
}

export async function getPlayerByDiscordId(discordId, teamId) {
  const db = getFirestore();
  const teamDoc = await db.collection('teams').doc(teamId).get();
  if (!teamDoc.exists) return null;
  const team = { id: teamDoc.id, ...teamDoc.data() };
  return team.members?.find(m => m.discordId === discordId) || null;
}
