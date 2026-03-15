import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import LoadingState from '../components/UI/LoadingState';
import { getRegionDisplay } from '../constants/regions';
import './PublicTeamProfile.css';

const getReliabilityTier = (score) => {
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
};

const PublicTeamProfile = () => {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [teamData, setTeamData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [isModerator, setIsModerator] = useState(false);
  const [memberUsernames, setMemberUsernames] = useState({});

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().isModerator === true) {
            setIsModerator(true);
          } else {
            setIsModerator(false);
          }
        } catch (error) {
          console.error('Error fetching moderator status:', error);
        }
      } else {
        setIsModerator(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadTeamProfile();
  }, [teamId]);

  const loadTeamProfile = async () => {
    try {
      const teamDoc = await getDoc(doc(db, 'teams', teamId));
      if (teamDoc.exists()) {
        const data = teamDoc.data();
        setTeamData({ id: teamDoc.id, ...data });

        // Fetch usernames for members (profiles use username, not UID)
        const members = data.members || [];
        const uidToUsername = {};
        await Promise.all(
          members
            .filter(m => m.uid)
            .map(async (m) => {
              try {
                const userDoc = await getDoc(doc(db, 'users', m.uid));
                if (userDoc.exists() && userDoc.data().username) {
                  uidToUsername[m.uid] = userDoc.data().username;
                }
              } catch (e) {
                console.warn('Could not fetch username for member', m.uid, e);
              }
            })
        );
        setMemberUsernames(uidToUsername);

        // Load reviews
        const reviewsSnapshot = await getDocs(
          query(collection(db, 'teamReviews'), where('teamId', '==', teamId))
        );
        const reviewsData = reviewsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setReviews(reviewsData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
      } else {
        setTeamData(null);
      }
    } catch (error) {
      console.error('Error loading team profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAvgSR = () => {
    if (!teamData?.members) return 0;
    const membersWithSR = teamData.members.filter(m => m.skillRating);
    if (membersWithSR.length === 0) return 0;
    const sum = membersWithSR.reduce((acc, m) => acc + (m.skillRating || 0), 0);
    return Math.round(sum / membersWithSR.length);
  };

  if (loading) {
    return (
      <div className="public-team-page">
        <div className="content-wrapper">
          <div className="team-content">
            <LoadingState message="Loading team profile..." />
          </div>
        </div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="public-team-page">
        <div className="content-wrapper">
          <div className="team-content">
            <div className="error-state">
              <h2>TEAM NOT FOUND</h2>
              <p>This team does not exist or has been removed.</p>
              <button className="back-btn" onClick={() => navigate('/')}>
                GO BACK
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleModerateRemoveImage = async () => {
    if (!isModerator || !teamData) return;
    if (!window.confirm('As a moderator, are you sure you want to remove this team\'s image?')) return;
    try {
      await updateDoc(doc(db, 'teams', teamData.id), {
        photoURL: null
      });
      setTeamData(prev => ({ ...prev, photoURL: null }));
    } catch (error) {
      console.error('Error removing team image:', error);
    }
  };

  const handleModerateDeleteReview = async (reviewId) => {
    if (!isModerator) return;
    if (!window.confirm('As a moderator, are you sure you want to delete this review?')) return;
    try {
      await deleteDoc(doc(db, 'teamReviews', reviewId));
      setReviews(prev => prev.filter(r => r.id !== reviewId));
    } catch (error) {
      console.error('Error deleting review:', error);
    }
  };

  const avgSR = calculateAvgSR();
  const isManager = currentUser && teamData.members?.some(
    m => m.uid === currentUser.uid && (m.roles?.includes('Manager') || m.roles?.includes('Owner'))
  );

  return (
    <div className="public-team-page">
      <div className="content-wrapper">
        <div className="team-content">
          <div className="team-header-section">
            <div className="team-avatar-container" style={{ position: 'relative' }}>
              <img 
                src={teamData.photoURL || '/default-team.svg'} 
                alt={teamData.name}
                className="team-avatar-large"
                onError={(e) => {
                  e.target.src = '/default-team.svg';
                }}
              />
              {isModerator && teamData.photoURL && (
                <button
                  onClick={handleModerateRemoveImage}
                  title="Remove Image (Moderator)"
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: 'red',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    zIndex: 10
                  }}
                >
                  X
                </button>
              )}
            </div>
            <div className="team-info-header">
              <div>
                <h1>{teamData.name}</h1>
                <div className="team-badges-header">
                  {teamData.region && <span className="badge">{getRegionDisplay(teamData.region) || teamData.region}</span>}
                  {teamData.faceitDiv && <span className="badge">{teamData.faceitDiv}</span>}
                  {teamData.tierRating && <span className="badge">Tier: {teamData.tierRating}</span>}
                  {avgSR > 0 && <span className="badge">Avg SR: {avgSR}</span>}
                  <span className={`badge reliability-badge reliability-${getReliabilityTier(teamData.reliabilityScore ?? 100)}`} title="Team reliability: responds quickly, rarely drops scrims">
                    Reliability: {teamData.reliabilityScore ?? 100}
                  </span>
                </div>
              </div>
              {isManager && (
                <button className="edit-team-btn" onClick={() => navigate('/teams/overwatch')}>
                  MANAGE TEAM
                </button>
              )}
            </div>
          </div>

          <div className="team-card">
            <div className="team-section">
              <h3>PLAYERS</h3>
              {teamData.members && teamData.members.length > 0 ? (
                <div className="players-list">
                  {teamData.members.map((member, idx) => (
                    <div key={member.uid || idx} className="player-item">
                      <div className="player-item-header">
                        <img 
                          src={member.photoURL || '/default-avatar.png'} 
                          alt={member.name}
                          className="player-avatar-small"
                          onError={(e) => {
                            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPgo8cGF0aCBkPSJNMjAgMTJDMTYuNjgxMiAxMiAxNCAxNC42ODEyIDE0IDE4QzE0IDIxLjMxODggMTYuNjgxMiAyNCAyMCAyNEMyMy4zMTg4IDI0IDI2IDIxLjMxODggMjYgMThDMjYgMTQuNjgxMiAyMy4zMTg4IDEyIDIwIDEyWk0yMCAyOEMxNS41ODE1IDI4IDEyIDI5Ljc5MDkgMTIgMzJWNDBIMjhWMzJDMjggMjkuNzkwOSAyNC40MTg1IDI4IDIwIDI4WiIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjUpIi8+Cjwvc3ZnPg==';
                          }}
                        />
                        <div className="player-item-info">
                          <h4 
                            onClick={() => {
                              const username = memberUsernames[member.uid];
                              if (username) navigate(`/profile/${username}`);
                            }} 
                            className={memberUsernames[member.uid] ? 'player-link' : ''}
                            style={memberUsernames[member.uid] ? undefined : { cursor: 'default' }}
                          >
                            {member.name || 'Unknown Player'}
                          </h4>
                          <div className="player-meta">
                            {member.roles && member.roles.length > 0 && (
                              <span className="player-roles">{member.roles.join(', ')}</span>
                            )}
                            {member.skillRating && (
                              <span className="player-sr">SR: {member.skillRating}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-players">No players listed</p>
              )}
            </div>

            {reviews.length > 0 && (
              <div className="team-section">
                <h3>REVIEWS ({reviews.length})</h3>
                <div className="reviews-list">
                  {reviews.map(review => (
                    <div key={review.id} className="review-item" style={{ position: 'relative' }}>
                      {isModerator && (
                        <button
                          onClick={() => handleModerateDeleteReview(review.id)}
                          title="Delete Review (Moderator)"
                          style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            background: 'var(--color-danger, #ff4d4d)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            zIndex: 10
                          }}
                        >
                          DELETE
                        </button>
                      )}
                      <div className="review-header">
                        <span className="review-author">{review.fromTeamName || 'Anonymous'}</span>
                        <span className="review-date">
                          {review.createdAt?.toDate().toLocaleDateString()}
                        </span>
                      </div>
                      <div className="review-rating">
                        {'★'.repeat(review.rating || 0)}{'☆'.repeat(5 - (review.rating || 0))}
                      </div>
                      {review.comment && (
                        <p className="review-comment">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicTeamProfile;






