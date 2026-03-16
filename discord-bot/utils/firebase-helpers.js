import { getFirestore } from '../firebase/config.js';

/**
 * Get team by manager's Discord ID
 * Optimized: First tries to query teams with managerDiscordIds array (if exists)
 * Falls back to scanning all teams if the optimized field doesn't exist
 */
export async function getTeamByManagerDiscordId(discordId) {
  const db = getFirestore();
  console.log(`🔍 Looking for team with manager Discord ID: ${discordId}`);
  
  try {
    const teamsRef = db.collection('teams');
    const startTime = Date.now();
    
    // First, try optimized query using managerDiscordIds array field
    // This is much faster than scanning all teams
    try {
      const optimizedQuery = teamsRef.where('managerDiscordIds', 'array-contains', discordId).limit(1);
      const optimizedSnapshot = await optimizedQuery.get();
      
      if (!optimizedSnapshot.empty) {
        const teamDoc = optimizedSnapshot.docs[0];
        const teamData = teamDoc.data();
        const team = { 
          id: teamDoc.id, 
          ...teamData,
          members: teamData.members || [] // Ensure members array exists
        };
        const queryTime = Date.now() - startTime;
        console.log(`✅ Found team "${team.name}" (${team.id}) using optimized query in ${queryTime}ms`);
        return team;
      }
      console.log('ℹ️  Optimized query returned no results, falling back to scan...');
    } catch (optimizedError) {
      // If the field doesn't exist or query fails, fall back to scanning
      console.log('ℹ️  Optimized query not available, scanning all teams...');
    }
    
    // Fallback: Scan all teams (slower but works)
    const snapshot = await teamsRef.get();
    const fetchTime = Date.now() - startTime;
    console.log(`⏱️  Fetched ${snapshot.docs.length} teams in ${fetchTime}ms`);

    let checkedCount = 0;
    for (const doc of snapshot.docs) {
      checkedCount++;
      const team = { id: doc.id, ...doc.data() };
      
      // Check if team has members array
      if (!team.members || !Array.isArray(team.members)) {
        continue;
      }
      
      // Find manager with matching Discord ID
      const manager = team.members.find(m => {
        const hasDiscordId = m.discordId === discordId;
        const hasManagerRole = m.roles && (
          m.roles.includes('Manager') || 
          m.roles.includes('Owner')
        );
        return hasDiscordId && hasManagerRole;
      });
      
      if (manager) {
        const totalTime = Date.now() - startTime;
        console.log(`✅ Found team "${team.name}" (${team.id}) after checking ${checkedCount} teams in ${totalTime}ms`);
        
        // Update team with managerDiscordIds field for future optimization
        try {
          const managerDiscordIds = team.members
            .filter(m => m.discordId && m.roles && (m.roles.includes('Manager') || m.roles.includes('Owner')))
            .map(m => m.discordId);
          
          if (managerDiscordIds.length > 0 && !team.managerDiscordIds) {
            await db.collection('teams').doc(team.id).update({
              managerDiscordIds: managerDiscordIds
            });
            console.log(`💾 Updated team ${team.id} with managerDiscordIds for future optimization`);
          }
        } catch (updateError) {
          console.error('⚠️  Failed to update team with managerDiscordIds:', updateError);
          // Don't fail the request if update fails
        }
        
        return team;
      }
      
      // Log progress every 50 teams to help debug (less verbose)
      if (checkedCount % 50 === 0) {
        console.log(`   Checked ${checkedCount}/${snapshot.docs.length} teams...`);
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`❌ No team found with manager Discord ID ${discordId} after checking ${checkedCount} teams in ${totalTime}ms`);
    return null;
  } catch (error) {
    console.error('❌ Error in getTeamByManagerDiscordId:', error);
    throw error;
  }
}

/**
 * Get player by Discord ID in a specific team
 */
export async function getPlayerByDiscordId(discordId, teamId) {
  const db = getFirestore();
  const teamDoc = await db.collection('teams').doc(teamId).get();
  
  if (!teamDoc.exists) {
    return null;
  }

  const team = { id: teamDoc.id, ...teamDoc.data() };
  const player = team.members?.find(m => m.discordId === discordId);
  
  return player || null;
}

/**
 * Get user by Discord ID (from users collection where discordId matches)
 */
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

/**
 * Get all teams
 */
export async function getAllTeams() {
  const db = getFirestore();
  const snapshot = await db.collection('teams').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all teams where user is manager (by Discord ID)
 */
export async function getManagerTeams(discordId) {
  const db = getFirestore();
  try {
    const snapshot = await db.collection('teams')
      .where('managerDiscordIds', 'array-contains', discordId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting manager teams:', error);
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
