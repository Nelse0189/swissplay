/**
 * Parser for ScrimTime CSV data (Overwatch Workshop Log)
 * Legend based on ScrimTime documentation for code 9GPA9
 */

export const parseScrimTimeCSV = (csvContent) => {
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  
  const scrimData = {
    metadata: null,
    players: [],
    teams: [],
    kills: [],
    ultimates: [],
    rounds: [],
    raw: csvContent
  };

  lines.forEach(line => {
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    const type = parseInt(parts[0]);

    switch (type) {
      case 0: // Match Metadata
        // MatchID, Map Name, Date, Version, Mode, Team 1 Name, Team 2 Name, Score 1, Score 2, Duration
        scrimData.metadata = {
          matchId: parts[1],
          mapName: parts[2],
          date: parts[3],
          version: parts[4],
          mode: parts[5],
          team1Name: parts[6],
          team2Name: parts[7],
          score1: parseInt(parts[8]),
          score2: parseInt(parts[9]),
          duration: parts[10]
        };
        break;

      case 1: // Player Stats
        // PlayerName, Hero, Team, Kills, Deaths, Damage, Healing, etc.
        scrimData.players.push({
          name: parts[1],
          hero: parts[2],
          team: parts[3],
          kills: parseInt(parts[4]) || 0,
          deaths: parseInt(parts[5]) || 0,
          damageDealt: parseInt(parts[6]) || 0,
          healingDealt: parseInt(parts[7]) || 0,
          ultimatesEarned: parseInt(parts[8]) || 0,
          ultimatesUsed: parseInt(parts[9]) || 0,
          assists: parseInt(parts[10]) || 0,
          soloKills: parseInt(parts[11]) || 0,
          criticalHits: parseInt(parts[12]) || 0,
          environmentalKills: parseInt(parts[13]) || 0,
          environmentalDeaths: parseInt(parts[14]) || 0,
          timePlayed: parts[15]
        });
        break;

      case 2: // Team Stats
        scrimData.teams.push({
          name: parts[1],
          score: parseInt(parts[2]) || 0,
          avgKills: parseFloat(parts[3]) || 0,
          avgDeaths: parseFloat(parts[4]) || 0,
          totalDamage: parseInt(parts[5]) || 0,
          totalHealing: parseInt(parts[6]) || 0
        });
        break;

      case 3: // Kill Log
        scrimData.kills.push({
          killer: parts[1],
          victim: parts[2],
          weapon: parts[3],
          isCrit: parts[4] === 'True',
          timestamp: parts[5]
        });
        break;

      case 4: // Ultimate Log
        scrimData.ultimates.push({
          player: parts[1],
          hero: parts[2],
          event: parts[3], // Start, End, Cancel
          timestamp: parts[4]
        });
        break;

      case 5: // Round End Stats
        scrimData.rounds.push({
          roundNumber: parseInt(parts[1]),
          winner: parts[2],
          score1: parseInt(parts[3]),
          score2: parseInt(parts[4]),
          timestamp: parts[5]
        });
        break;

      default:
        // Unknown type
        break;
    }
  });

  return scrimData;
};

/**
 * Validates if the file content looks like a ScrimTime CSV
 */
export const isValidScrimTimeCSV = (content) => {
  if (!content) return false;
  const lines = content.split('\n');
  if (lines.length < 1) return false;
  
  // Check first few lines for the expected numeric type prefix
  const firstLine = lines[0].trim();
  const firstChar = firstLine.charAt(0);
  return ['0', '1', '2', '3', '4', '5'].includes(firstChar);
};


