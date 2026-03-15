import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import LoadingState from '../components/UI/LoadingState';
import DiscordLinkingSection from '../components/DiscordLinkingSection';
import { getRegionDisplay } from '../constants/regions';
import './PublicPlayerProfile.css';

const PublicPlayerProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTeamHistory, setShowTeamHistory] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      let profileUid = null;
      let data = null;

      // Look up by username only (case-insensitive: stored lowercase)
      const usernameQuery = query(
        collection(db, 'users'),
        where('username', '==', userId?.toLowerCase() || '')
      );
      const usernameSnap = await getDocs(usernameQuery);
      if (!usernameSnap.empty) {
        const userDoc = usernameSnap.docs[0];
        data = userDoc.data();
        profileUid = userDoc.id;
      }

      if (data && profileUid) {
        setProfileData({ ...data, uid: profileUid });
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        const userTeams = teamsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(team => team.members?.some(m => m.uid === profileUid));
        setTeams(userTeams);
      } else {
        setProfileData(null);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="public-profile-page">
        <div className="content-wrapper">
          <div className="profile-content">
            <LoadingState message="Loading profile..." />
          </div>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="public-profile-page">
        <div className="content-wrapper">
          <div className="profile-content">
            <div className="error-state">
              <h2>PROFILE NOT FOUND</h2>
              <p>This profile does not exist or has been removed.</p>
              <button className="back-btn" onClick={() => navigate('/')}>
                GO BACK
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const profileUid = profileData?.uid;
  const isOwnProfile = currentUser?.uid === profileUid;

  return (
    <div className="public-profile-page">
      <div className="content-wrapper">
        <div className="profile-content">
          <div className="profile-header-section">
            <div className="profile-avatar-container">
              <img 
                src={profileData.photoURL || '/default-avatar.png'} 
                alt={profileData.displayName}
                className="profile-avatar-large"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjYwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPHBhdGggZD0iTTYwIDM2QzQ4LjA0NDMgMzYgMzggNDYuMDQ0MyAzOCA1OEMzOCA2OS45NTU3IDQ4LjA0NDMgODAgNjAgODBDNzEuOTU1NyA4MCA4MiA2OS45NTU3IDgyIDU4QzgyIDQ2LjA0NDMgNzEuOTU1NyAzNiA2MCAzNlpNNjAgODRDMzkuNDg0NSA4NCAyNCA5NS4zNzI3IDI0IDEwOEg5NkM5NiA5NS4zNzI3IDgwLjUxNTUgODQgNjAgODRaIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNSkiLz4KPC9zdmc+';
                }}
              />
            </div>
            <div className="profile-info-header">
              <h1>{profileData.displayName || 'Unknown Player'}</h1>
              {isOwnProfile && (
                <button className="edit-profile-btn" onClick={() => navigate('/profile/edit')}>
                  EDIT PROFILE
                </button>
              )}
            </div>
          </div>

          <div className="profile-card">
            {profileData.bio && (
              <div className="profile-section">
                <h3>BIOGRAPHY</h3>
                <p className="bio-text">{profileData.bio}</p>
              </div>
            )}

            <div className="profile-section">
              <h3>TEAM MEMBERSHIPS</h3>
              {teams.length > 0 ? (
                <>
                  {isOwnProfile && (
                    <div className="toggle-section">
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={showTeamHistory}
                          onChange={(e) => setShowTeamHistory(e.target.checked)}
                        />
                        <span>Show team history</span>
                      </label>
                    </div>
                  )}
                  {showTeamHistory && (
                    <div className="teams-list">
                      {teams.map(team => (
                        <div key={team.id} className="team-item">
                          <div className="team-item-header">
                            <img 
                              src={team.photoURL || '/default-team.svg'} 
                              alt={team.name}
                              className="team-avatar-small"
                              onError={(e) => {
                                e.target.src = '/default-team.svg';
                              }}
                            />
                            <div className="team-item-info">
                              <h4 onClick={() => navigate(`/teams/${team.id}`)} className="team-link">
                                {team.name}
                              </h4>
                              <span className="team-meta">
                                {getRegionDisplay(team.region) || team.region} • {team.faceitDiv || 'Open'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="no-teams">No team memberships</p>
              )}
            </div>

            {currentUser && (isOwnProfile || profileData.discordId) && (
              <div className="profile-section">
                <h3>DISCORD</h3>
                {isOwnProfile ? (
                  <DiscordLinkingSection user={currentUser} showHeading={false} />
                ) : (
                  <p className="discord-info">Linked: {profileData.discordUsername || 'Connected'}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicPlayerProfile;






