export const parseScrimTimeCSV = (csvContent) => {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
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
      case 0:
        scrimData.metadata = {
          matchId: parts[1], mapName: parts[2], date: parts[3], version: parts[4], mode: parts[5],
          team1Name: parts[6], team2Name: parts[7], score1: parseInt(parts[8]), score2: parseInt(parts[9]), duration: parts[10]
        };
        break;
      case 1:
        scrimData.players.push({
          name: parts[1], hero: parts[2], team: parts[3], kills: parseInt(parts[4]) || 0, deaths: parseInt(parts[5]) || 0,
          damageDealt: parseInt(parts[6]) || 0, healingDealt: parseInt(parts[7]) || 0, ultimatesEarned: parseInt(parts[8]) || 0,
          ultimatesUsed: parseInt(parts[9]) || 0, assists: parseInt(parts[10]) || 0, soloKills: parseInt(parts[11]) || 0,
          criticalHits: parseInt(parts[12]) || 0, environmentalKills: parseInt(parts[13]) || 0, environmentalDeaths: parseInt(parts[14]) || 0, timePlayed: parts[15]
        });
        break;
      case 2:
        scrimData.teams.push({ name: parts[1], score: parseInt(parts[2]) || 0, avgKills: parseFloat(parts[3]) || 0, avgDeaths: parseFloat(parts[4]) || 0, totalDamage: parseInt(parts[5]) || 0, totalHealing: parseInt(parts[6]) || 0 });
        break;
      case 3:
        scrimData.kills.push({ killer: parts[1], victim: parts[2], weapon: parts[3], isCrit: parts[4] === 'True', timestamp: parts[5] });
        break;
      case 4:
        scrimData.ultimates.push({ player: parts[1], hero: parts[2], event: parts[3], timestamp: parts[4] });
        break;
      case 5:
        scrimData.rounds.push({ roundNumber: parseInt(parts[1]), winner: parts[2], score1: parseInt(parts[3]), score2: parseInt(parts[4]), timestamp: parts[5] });
        break;
    }
  });
  return scrimData;
};

export const isValidScrimTimeCSV = (content) => {
  if (!content) return false;
  const lines = content.split(/\r?\n/);
  if (lines.length < 1) return false;
  const firstChar = lines[0].trim().charAt(0);
  return ['0', '1', '2', '3', '4', '5'].includes(firstChar);
};
