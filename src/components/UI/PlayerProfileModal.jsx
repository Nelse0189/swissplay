import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import './PlayerProfileModal.css';

const PlayerProfileModal = ({ isOpen, onClose, player, team }) => {
  const [playerData, setPlayerData] = useState(null);
  const [playerTeams, setPlayerTeams] = useState([]);
  const [showTeamHistory, setShowTeamHistory] = useState(true);
  const [loading, setLoading] = useState(false);

  // Detailed logging
  useEffect(() => {
    console.log('[PlayerProfileModal] Props changed:', {
      isOpen,
      player: player ? { name: player.name, uid: player.uid } : null,
      team: team ? { id: team.id, name: team.name } : null
    });
  }, [isOpen, player, team]);

  useEffect(() => {
    console.log('[PlayerProfileModal] State changed:', {
      playerData,
      playerTeams: playerTeams.length,
      loading,
      showTeamHistory
    });
  }, [playerData, playerTeams, loading, showTeamHistory]);

  useEffect(() => {
    if (isOpen && player) {
      console.log('[PlayerProfileModal] Loading player data...');
      loadPlayerData();
    } else {
      console.log('[PlayerProfileModal] Clearing data');
      setPlayerData(null);
      setPlayerTeams([]);
    }
  }, [isOpen, player]);

  // Prevent body scroll when modal is open, but allow overlay to scroll
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      // Prevent body scroll but allow overlay scrolling
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.left = '0';
      document.body.style.right = '0';
      
      return () => {
        // Restore scroll position when modal closes
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.left = '';
        document.body.style.right = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  const loadPlayerData = async () => {
    console.log('[PlayerProfileModal] loadPlayerData called:', { player });
    if (!player || !player.uid) {
      console.warn('[PlayerProfileModal] No player or uid provided');
      return;
    }
    
    setLoading(true);
    try {
      console.log('[PlayerProfileModal] Loading from Firestore');
      // Load from Firestore
      const userDoc = await getDoc(doc(db, 'users', player.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setPlayerData({
          displayName: data.displayName || player.name,
          bio: data.bio || 'No bio available.',
          photoURL: data.photoURL || player.photoURL || '/default-avatar.svg'
        });
      } else {
        // Fallback to player data from team
        setPlayerData({
          displayName: player.name,
          bio: 'No bio available.',
          photoURL: player.photoURL || '/default-avatar.svg'
        });
      }

      // Load teams the player is/was part of
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      const userTeams = teamsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => t.members?.some(m => m.uid === player.uid))
        .map(t => ({
          id: t.id,
          name: t.name,
          photoURL: t.photoURL,
          isCurrent: t.id === team?.id
        }));
      setPlayerTeams(userTeams);
    } catch (error) {
      console.error('[PlayerProfileModal] Error loading player data:', error);
    } finally {
      setLoading(false);
      console.log('[PlayerProfileModal] Loading complete');
    }
  };

  if (!isOpen) {
    console.log('[PlayerProfileModal] Not rendering - isOpen is false');
    return null;
  }

  if (!player) {
    console.log('[PlayerProfileModal] Not rendering - no player provided');
    return null;
  }

  console.log('[PlayerProfileModal] Rendering modal:', {
    isOpen,
    player: player ? { name: player.name, uid: player.uid } : null,
    team: team ? { id: team.id, name: team.name } : null,
    loading,
    hasPlayerData: !!playerData,
    playerTeamsCount: playerTeams.length,
    playerName: playerData?.displayName || player?.name
  });

  // Get computed styles and ensure scrollability
  useEffect(() => {
    if (isOpen) {
      const overlay = document.querySelector('.player-profile-modal-overlay');
      const modal = document.querySelector('.player-profile-modal');
      
      if (overlay) {
        const overlayStyles = window.getComputedStyle(overlay);
        console.log('[PlayerProfileModal] Overlay computed styles:', {
          overflowY: overlayStyles.overflowY,
          height: overlayStyles.height,
          maxHeight: overlayStyles.maxHeight,
          scrollHeight: overlay.scrollHeight,
          clientHeight: overlay.clientHeight,
          canScroll: overlay.scrollHeight > overlay.clientHeight
        });
        
        // Ensure overlay is scrollable
        overlay.style.overflowY = 'scroll';
        overlay.style.overflowX = 'hidden';
      }
      
      if (modal) {
        const styles = window.getComputedStyle(modal);
        console.log('[PlayerProfileModal] Modal computed styles:', {
          backgroundColor: styles.backgroundColor,
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          zIndex: styles.zIndex,
          width: styles.width,
          height: styles.height,
          marginBottom: styles.marginBottom,
          scrollHeight: modal.scrollHeight,
          clientHeight: modal.clientHeight
        });
        
        // Ensure modal has bottom margin
        modal.style.marginBottom = '2rem';
      }
    }
  }, [isOpen]);

  const modalContent = (
    <div 
      className="player-profile-modal-overlay" 
      onClick={(e) => {
        console.log('[PlayerProfileModal] Overlay clicked');
        onClose();
      }}
      style={{ 
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflowY: 'scroll',
        overflowX: 'hidden',
        paddingTop: '2rem',
        paddingBottom: '2rem',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div 
        className="player-profile-modal" 
        onClick={(e) => {
          console.log('[PlayerProfileModal] Modal clicked');
          e.stopPropagation();
        }}
        style={{
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          backgroundColor: 'var(--color-background-card, rgba(30, 20, 50, 0.95))',
          marginTop: '0',
          marginBottom: '3rem',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}
      >
        <button className="player-profile-modal-close" onClick={onClose}>×</button>
        
        {loading ? (
          <div className="player-profile-loading">LOADING PROFILE...</div>
        ) : playerData ? (
          <>
            {console.log('[PlayerProfileModal] Rendering player data:', playerData)}
            <div className="player-profile-header">
              <div>
                <img 
                  src={playerData.photoURL || '/default-avatar.svg'} 
                  alt={playerData.displayName}
                  className="player-profile-avatar"
                  onError={(e) => {
                    console.log('[PlayerProfileModal] Image error, using fallback');
                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjYwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPHBhdGggZD0iTTYwIDM2QzQ4LjA0NDMgMzYgMzggNDYuMDQ0MyAzOCA1OEMzOCA2OS45NTU3IDQ4LjA0NDMgODAgNjAgODBDNzEuOTU1NyA4MCA4MiA2OS45NTU3IDgyIDU4QzgyIDQ2LjA0NDMgNzEuOTU1NyAzNiA2MCAzNlpNNjAgODRDMzkuNDg0NSA4NCAyNCA5NS4zNzI3IDI0IDEwOEg5NkM5NiA5NS4zNzI3IDgwLjUxNTUgODQgNjAgODRaIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNSkiLz4KPC9zdmc+';
                  }}
                />
              </div>
              <h2>{playerData.displayName}</h2>
            </div>

            <div className="player-profile-content">
              <div className="player-profile-section">
                <h3>BIO</h3>
                <p className="player-bio">{playerData.bio}</p>
              </div>

              {playerTeams.length > 0 && (
                <div className="player-profile-section">
                  <div className="player-teams-header">
                    <h3>TEAMS</h3>
                    <button 
                      className="toggle-team-history"
                      onClick={() => setShowTeamHistory(!showTeamHistory)}
                    >
                      {showTeamHistory ? 'HIDE HISTORY' : 'SHOW HISTORY'}
                    </button>
                  </div>
                  {showTeamHistory && (
                    <div className="player-teams-list">
                      {playerTeams.map((t, idx) => (
                        <div key={t.id || idx} className="player-team-item">
                          <img 
                            src={t.photoURL || '/default-team.svg'} 
                            alt={t.name}
                            className="player-team-icon"
                            onError={(e) => {
                              e.target.src = '/default-team.svg';
                            }}
                          />
                          <span className="player-team-name">{t.name}</span>
                          {t.isCurrent && (
                            <span className="player-team-current">CURRENT</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {console.log('[PlayerProfileModal] No player data, showing error')}
            <div className="player-profile-error">PROFILE NOT FOUND</div>
          </>
        )}
      </div>
    </div>
  );

  // Render modal using React Portal to ensure it's at the document body level
  return createPortal(modalContent, document.body);
};

export default PlayerProfileModal;






