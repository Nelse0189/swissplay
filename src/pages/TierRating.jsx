import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { getRankLabel } from '../utils/overwatchRanks';
import LoadingState from '../components/UI/LoadingState';
import './TierRating.css';

const TierRating = () => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          }
        } catch (error) {
          console.error('Error loading profile:', error);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getTierInfo = (tier) => {
    const tiers = {
      'Grandmaster': { color: '#ff6b6b', description: 'Elite competitive tier' },
      'Master': { color: '#4ecdc4', description: 'High-level competitive tier' },
      'Diamond': { color: '#45b7d1', description: 'Advanced competitive tier' },
      'Platinum': { color: '#96ceb4', description: 'Intermediate competitive tier' },
      'Gold': { color: '#ffeaa7', description: 'Standard competitive tier' },
      'Silver': { color: '#dfe6e9', description: 'Developing competitive tier' },
      'Bronze': { color: '#d63031', description: 'Entry competitive tier' }
    };
    return tiers[tier] || { color: '#7289da', description: 'Not yet rated' };
  };

  const tierRating = userData?.tierRating;
  const tierInfo = getTierInfo(tierRating);

  if (loading) {
    return (
      <div className="tier-rating-page">
        <div className="content-wrapper">
          <div className="tier-rating-content">
            <LoadingState message="Loading tier rating..." />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="tier-rating-page">
        <div className="content-wrapper">
          <div className="tier-rating-content">
            <div className="auth-prompt-container">
              <h2>AUTHENTICATION REQUIRED</h2>
              <p>PLEASE SIGN IN TO VIEW YOUR TIER RATING.</p>
              <button className="save-btn" onClick={() => navigate('/auth')}>
                SIGN IN
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tier-rating-page">
      <div className="content-wrapper">
        <div className="tier-rating-content">
          <div className="tier-rating-header">
            <h1>TIER RATING</h1>
            <button className="save-btn" onClick={() => navigate('/profile')}>
              BACK TO PROFILE
            </button>
          </div>

          <div className="tier-rating-card">
            <div className="tier-display">
              <div 
                className="tier-badge"
                style={{ borderColor: tierInfo.color }}
              >
                <span className="tier-name" style={{ color: tierInfo.color }}>
                  {tierRating || 'UNRATED'}
                </span>
              </div>
              <p className="tier-description">{tierInfo.description}</p>
            </div>

            <div className="tier-info-section">
              <h3>RATING DETAILS</h3>
              <div className="info-row">
                <span className="info-label">CURRENT TIER</span>
                <span className="info-value" style={{ color: tierInfo.color }}>
                  {tierRating || 'Not Rated'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">SKILL RATING</span>
                <span className="info-value">
                  {userData?.skillRating ? (getRankLabel(userData.skillRating) || `${userData.skillRating} SR`) : 'Not Set'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">LAST UPDATED</span>
                <span className="info-value">
                  {userData?.tierUpdatedAt 
                    ? new Date(userData.tierUpdatedAt.toDate()).toLocaleDateString()
                    : 'Never'}
                </span>
              </div>
            </div>

            <div className="tier-info-section">
              <h3>TIER SYSTEM</h3>
              <div className="tier-list">
                {['Grandmaster', 'Master', 'Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze'].map((tier) => {
                  const info = getTierInfo(tier);
                  const isCurrent = tier === tierRating;
                  return (
                    <div 
                      key={tier} 
                      className={`tier-item ${isCurrent ? 'current' : ''}`}
                      style={isCurrent ? { borderColor: info.color } : {}}
                    >
                      <span className="tier-item-name" style={{ color: info.color }}>
                        {tier}
                      </span>
                      <span className="tier-item-desc">{info.description}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="tier-actions">
              <button className="save-btn" onClick={() => navigate('/profile/revaluation')}>
                REQUEST SKILL REVALUATION
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TierRating;

