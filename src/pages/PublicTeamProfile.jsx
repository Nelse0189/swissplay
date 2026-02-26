import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import LoadingState from '../components/UI/LoadingState';
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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
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

  const avgSR = calculateAvgSR();
  const isManager = currentUser && teamData.members?.some(
    m => m.uid === currentUser.uid && (m.roles?.includes('Manager') || m.roles?.includes('Owner'))
  );

  return (
    <div className="public-team-page">
      <div className="content-wrapper">
        <div className="team-content">
          <div className="team-header-section">
            <div className="team-avatar-container">
              <img 
                src={teamData.photoURL || '/default-team.svg'} 
                alt={teamData.name}
                className="team-avatar-large"
                onError={(e) => {
                  e.target.src = '/default-team.svg';
                }}
              />
            </div>
            <div className="team-info-header">
              <div>
                <h1>{teamData.name}</h1>
                <div className="team-badges-header">
                  {teamData.region && <span className="badge">{teamData.region}</span>}
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
                            onClick={() => navigate(`/profile/${member.uid}`)} 
                            className="player-link"
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
                    <div key={review.id} className="review-item">
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






