import React, { useState, useEffect } from 'react';
import './AvailabilityTab.css';

const AvailabilityTab = ({ currentUser, team, updateTeamSettings, updateTeamSchedule, canEditSettings }) => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 25 }, (_, i) => i);
  
  const currentMember = team.members.find(m => m.uid === currentUser.uid);
  const isManager = currentMember?.roles?.includes('Manager') || currentMember?.roles?.includes('Owner');
  const hideCompWarning = team.hideCompWarning === true;

  const [selectedTeamSlots, setSelectedTeamSlots] = useState(() => {
    return (team.schedule || []).map(s => `${s.day}-${s.hour}`);
  });

  useEffect(() => {
    if (team.schedule) {
      setSelectedTeamSlots(team.schedule.map(s => `${s.day}-${s.hour}`));
    }
  }, [team.schedule]);

  const [hoveredWarningSlot, setHoveredWarningSlot] = useState(null);

  const handleToggleHideCompWarning = () => {
    if (updateTeamSettings && canEditSettings) {
      updateTeamSettings({ hideCompWarning: !hideCompWarning });
    }
  };

  const toggleTeamSlot = (day, hour) => {
    if (!isManager) return;
    const slot = `${day}-${hour}`;
    let newSlots;
    if (selectedTeamSlots.includes(slot)) {
      newSlots = selectedTeamSlots.filter(s => s !== slot);
    } else {
      newSlots = [...selectedTeamSlots, slot];
    }
    setSelectedTeamSlots(newSlots);

    if (updateTeamSchedule) {
      const newSchedule = newSlots.map(s => {
        const [d, h] = s.split('-');
        return { day: d, hour: parseInt(h, 10) };
      });
      updateTeamSchedule(newSchedule);
    }
  };

  const getCompStatus = (availableMembers) => {
    const requirements = { Tank: 1, DPS: 2, Support: 2 };
    const membersWithRoles = availableMembers.filter(m => m.playerRoles && m.playerRoles.length > 0);
    
    let found = false;
    let bestMatch = { Tank: 0, DPS: 0, Support: 0 };
    let minMissingCount = 5;
    
    const backtrack = (memberIndex, currentCounts) => {
      if (found) return;
      
      let missingCount = 
        Math.max(0, requirements.Tank - currentCounts.Tank) + 
        Math.max(0, requirements.DPS - currentCounts.DPS) + 
        Math.max(0, requirements.Support - currentCounts.Support);
        
      if (missingCount < minMissingCount) {
        minMissingCount = missingCount;
        bestMatch = { ...currentCounts };
      }

      if (missingCount === 0) {
        found = true;
        return;
      }
      if (memberIndex >= membersWithRoles.length) return;
      
      backtrack(memberIndex + 1, currentCounts);
      
      const member = membersWithRoles[memberIndex];
      for (let role of member.playerRoles) {
        let normalizedRole = role.toLowerCase().includes('tank') ? 'Tank' 
                           : role.toLowerCase().includes('dps') ? 'DPS' 
                           : role.toLowerCase().includes('support') ? 'Support' : null;
        if (normalizedRole && currentCounts[normalizedRole] < requirements[normalizedRole]) {
          currentCounts[normalizedRole]++;
          backtrack(memberIndex + 1, currentCounts);
          currentCounts[normalizedRole]--;
        }
      }
    };
    
    backtrack(0, { Tank: 0, DPS: 0, Support: 0 });
    
    if (found) return { hasComp: true, missingMessage: '' };
    
    const missing = [];
    if (bestMatch.Tank < requirements.Tank) missing.push(`${requirements.Tank - bestMatch.Tank} Tank`);
    if (bestMatch.DPS < requirements.DPS) missing.push(`${requirements.DPS - bestMatch.DPS} DPS`);
    if (bestMatch.Support < requirements.Support) missing.push(`${requirements.Support - bestMatch.Support} Support`);
    
    return { hasComp: false, missingMessage: missing.join(', ') };
  };

  return (
    <div className="availability-tab">
      <div className="availability-header">
        <h3>TEAM AVAILABILITY</h3>
      </div>

      <div className="team-availability-info" style={{ marginBottom: '1rem', fontFamily: "'Share Tech Mono', monospace", color: '#666', fontSize: '0.8rem' }}>
        <p>SELECT NODES TO PROPOSE SCRIM TIMES. {!hideCompWarning && 'WARNING (⚠️) INDICATES SELECTED SLOT CANNOT FULFILL STANDARD COMP (1 TANK, 2 DPS, 2 SUPPORT).'}</p>
        {isManager && canEditSettings && updateTeamSettings && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={hideCompWarning}
              onChange={handleToggleHideCompWarning}
              style={{ cursor: 'pointer' }}
            />
            <span>Hide comp warning (team does not track individual player availability)</span>
          </label>
        )}
      </div>

      <div className="digital-grid-container" onMouseLeave={() => setHoveredWarningSlot(null)}>
        <div className="grid-time-header">
          <div className="corner-spacer"></div>
          {hours.map(h => (
            <div key={h} className="header-cell">
              {h.toString().padStart(2, '0')}
            </div>
          ))}
        </div>
        
        {days.map(day => (
          <div key={day} className="grid-row">
            <div className="row-label">{day.substring(0, 3).toUpperCase()}</div>
            <div className="row-cells">
              {hours.map(hour => {
                const slot = `${day}-${hour}`;
                const availableMembers = team.members.filter(m => m.availability && m.availability.includes(slot));
                const isSelected = selectedTeamSlots.includes(slot);
                const compStatus = getCompStatus(availableMembers);
                const showWarning = !hideCompWarning && isSelected && !compStatus.hasComp;
                
                const opacity = availableMembers.length > 0 ? 0.1 + (availableMembers.length / team.members.length) * 0.7 : 0.05;
                const cellStyle = showWarning || isSelected ? {} : { background: availableMembers.length > 0 ? `rgba(26, 26, 26, ${opacity})` : '' };
                
                return (
                  <div
                    key={`${day}-${hour}`}
                    className={`grid-cell team-cell ${isSelected ? (showWarning ? 'warning' : 'active') : ''} ${!isManager ? 'disabled' : ''}`}
                    style={cellStyle}
                    onClick={() => toggleTeamSlot(day, hour)}
                    onMouseEnter={() => {
                      if (showWarning) {
                        setHoveredWarningSlot({ day, hour, missing: compStatus.missingMessage });
                      } else {
                        setHoveredWarningSlot(null);
                      }
                    }}
                    title={availableMembers.length > 0 ? `Available: ${availableMembers.map(m => m.name).join(', ')}` : 'No one available'}
                  >
                    {showWarning && <span className="warning-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '12px' }}>⚠️</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hoveredWarningSlot && (
        <div className="warning-explanation-popup" style={{
          marginTop: '10px',
          padding: '10px',
          background: 'rgba(255, 50, 50, 0.1)',
          border: '1px solid rgba(255, 50, 50, 0.5)',
          borderRadius: '4px',
          color: '#ff4444',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <div>
            <strong>{hoveredWarningSlot.day} {hoveredWarningSlot.hour.toString().padStart(2, '0')}:00</strong>
            <br />
            Cannot fulfill standard comp. Missing: {hoveredWarningSlot.missing}
          </div>
        </div>
      )}
    </div>
  );
};

export default AvailabilityTab;
