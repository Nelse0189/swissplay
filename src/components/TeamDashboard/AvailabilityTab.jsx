import React, { useState, useEffect } from 'react';
import CustomDropdown from '../UI/CustomDropdown';
import './AvailabilityTab.css';

const RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Masters', 'Grandmaster', 'Champion'];
const RANK_NUMBERS = [5, 4, 3, 2, 1]; // 1 is highest

const AvailabilityTab = ({ currentUser, team, updateAvailability, updateSkillRange }) => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const currentMember = team.members.find(m => m.uid === currentUser.uid);
  const userAvailability = currentMember?.availability || [];
  const skillRange = currentMember?.skillRange || { minRank: '', minNumber: '', maxRank: '', maxNumber: '' };
  
  const [localSkillRange, setLocalSkillRange] = useState(skillRange);

  useEffect(() => {
    setLocalSkillRange(skillRange);
  }, [skillRange]);

  const handleSkillRangeChange = (field, value) => {
    const newRange = { ...localSkillRange, [field]: value };
    setLocalSkillRange(newRange);
    if (updateSkillRange) {
      updateSkillRange(newRange);
    }
  };

  const getRankOptions = () => {
    return RANKS.map(rank => ({ value: rank, label: rank }));
  };

  const getRankNumberOptions = () => {
    return RANK_NUMBERS.map(num => ({ value: num.toString(), label: num.toString() }));
  };

  return (
    <div className="availability-tab">
      <div className="availability-header">
        <h3>OPERATOR AVAILABILITY</h3>
      </div>

      <div className="skill-range-section">
        <h3>SKILL RANGE</h3>
        <p>SET YOUR COMPETITIVE RANK RANGE (FOR MANAGER MATCHING)</p>
        <div className="skill-range-controls">
          <div className="skill-range-group">
            <label>MIN RANK</label>
            <div className="skill-range-row">
              <CustomDropdown
                options={[{ value: '', label: '-- SELECT --' }, ...getRankOptions()]}
                value={localSkillRange.minRank}
                onChange={(value) => handleSkillRangeChange('minRank', value)}
                placeholder="-- SELECT --"
              />
              <CustomDropdown
                options={[{ value: '', label: '--' }, ...getRankNumberOptions()]}
                value={localSkillRange.minNumber}
                onChange={(value) => handleSkillRangeChange('minNumber', value)}
                placeholder="--"
              />
            </div>
          </div>
          <div className="skill-range-group">
            <label>MAX RANK</label>
            <div className="skill-range-row">
              <CustomDropdown
                options={[{ value: '', label: '-- SELECT --' }, ...getRankOptions()]}
                value={localSkillRange.maxRank}
                onChange={(value) => handleSkillRangeChange('maxRank', value)}
                placeholder="-- SELECT --"
              />
              <CustomDropdown
                options={[{ value: '', label: '--' }, ...getRankNumberOptions()]}
                value={localSkillRange.maxNumber}
                onChange={(value) => handleSkillRangeChange('maxNumber', value)}
                placeholder="--"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="digital-grid-container">
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
                const isSelected = userAvailability.includes(`${day}-${hour}`);
                return (
                  <div
                    key={`${day}-${hour}`}
                    className={`grid-cell ${isSelected ? 'active' : ''}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AvailabilityTab;
