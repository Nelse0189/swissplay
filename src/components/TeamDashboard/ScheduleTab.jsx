import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import './ScheduleTab.css';

const ScheduleTab = ({ team, members, currentUser }) => {
  const [scheduledScrims, setScheduledScrims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (team && team.id) {
      loadScheduledScrims();
    }
  }, [team]);

  const loadScheduledScrims = async () => {
    try {
      // Get all accepted scrim requests where this team is involved
      const requestsRef = collection(db, 'scrimRequests');
      const q1 = query(
        requestsRef,
        where('status', '==', 'accepted'),
        where('fromTeamId', '==', team.id)
      );
      const q2 = query(
        requestsRef,
        where('status', '==', 'accepted'),
        where('toTeamId', '==', team.id)
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ]);

      const scrims1 = snapshot1.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        opponent: doc.data().toTeamName,
        isOutgoing: true
      }));

      const scrims2 = snapshot2.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        opponent: doc.data().fromTeamName,
        isOutgoing: false
      }));

      const allScrims = [...scrims1, ...scrims2];
      setScheduledScrims(allScrims);
    } catch (error) {
      console.error('Error loading scheduled scrims:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sort members by role priority
  const getRolePriority = (roles) => {
    if (roles.includes('Owner')) return 0;
    if (roles.includes('Manager')) return 1;
    if (roles.includes('Coach')) return 2;
    return 3;
  };

  const sortedMembers = [...members].sort((a, b) => 
    getRolePriority(a.roles) - getRolePriority(b.roles)
  );

  // Group scrims by day
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const scrimsByDay = days.reduce((acc, day) => {
    acc[day] = scheduledScrims.filter(scrim => scrim.slot?.day === day);
    return acc;
  }, {});

  return (
    <div className="schedule-tab">
      <div className="roster-section">
        <h3>TEAM ROSTER</h3>
        <div className="roster-grid">
          {sortedMembers.map((member, index) => (
            <div key={index} className="roster-card">
              <div className="member-role">{member.roles.join(', ').toUpperCase()}</div>
              <div className="member-name">{member.name}</div>
              {member.playerRoles && (
                <div className="player-roles">{member.playerRoles.join(' | ')}</div>
              )}
              {member.discordUsername ? (
                <div className="discord-info" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#7289da' }}>
                  💬 Discord: {member.discordUsername}
                </div>
              ) : member.discordId ? (
                <div className="discord-info" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#ffaa00' }}>
                  💬 Discord: Username not available
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="schedule-section">
        <h3>SCHEDULED SCRIMS</h3>
        {loading ? (
          <div className="loading-schedule">LOADING SCHEDULE...</div>
        ) : scheduledScrims.length > 0 ? (
          <div className="schedule-calendar">
            {days.map(day => {
              const dayScrims = scrimsByDay[day];
              if (!dayScrims || dayScrims.length === 0) return null;

              return (
                <div key={day} className="day-column">
                  <div className="day-header">{day.toUpperCase()}</div>
                  <div className="day-scrims">
                    {dayScrims
                      .sort((a, b) => (a.slot?.hour || 0) - (b.slot?.hour || 0))
                      .map((scrim) => (
                        <div key={scrim.id} className="scrim-card">
                          <div className="scrim-time">
                            {scrim.slot?.hour || 0}:00 - {(scrim.slot?.hour || 0) + 1}:00
                          </div>
                          <div className="scrim-opponent">
                            VS {scrim.opponent}
                          </div>
                          <div className="scrim-status">
                            {scrim.isOutgoing ? 'OUTGOING' : 'INCOMING'}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="no-scrims">
            <p>NO SCHEDULED SCRIMS</p>
            <p className="subtext">ACCEPTED SCRIM REQUESTS WILL APPEAR HERE</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleTab;
