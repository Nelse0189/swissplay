import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/UI/LoadingState';
import DiscordLinkingSection from '../components/DiscordLinkingSection';
import './Profile.css';

const Profile = () => {
  const { user, userData, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && userData?.username) {
      navigate(`/profile/${userData.username}`, { replace: true });
    }
  }, [loading, user, userData?.username, navigate]);

  if (loading) {
    return (
      <div className="profile-page">
        <div className="content-wrapper">
          <div className="profile-content">
            <LoadingState message="Loading profile..." />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-page">
        <div className="content-wrapper">
          <div className="profile-content">
            <div className="auth-prompt-container">
              <h2>AUTHENTICATION REQUIRED</h2>
              <p>PLEASE SIGN IN TO VIEW YOUR PROFILE.</p>
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
    <div className="profile-page">
      <div className="content-wrapper">
        <div className="profile-content">
          <div className="profile-header">
            <div className="profile-header-content">
              <div className="profile-avatar-section">
                <img 
                  src={userData?.photoURL || user?.photoURL || '/default-avatar.svg'} 
                  alt={userData?.displayName || user?.displayName || 'Profile'}
                  className="profile-avatar-large"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/default-avatar.svg';
                  }}
                />
              </div>
              <div className="profile-header-text">
                <h1>{userData?.displayName || user.displayName || 'User'}</h1>
                <button className="save-btn" onClick={() => navigate('/profile/edit')}>
                  EDIT PROFILE
                </button>
              </div>
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-section">
              <h3>ACCOUNT INFORMATION</h3>
              <div className="info-row">
                <span className="info-label">DISPLAY NAME</span>
                <span className="info-value">{userData?.displayName || user.displayName || 'Not set'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">EMAIL</span>
                <span className="info-value">{user.email}</span>
              </div>
            </div>

            <div className="profile-section">
              <h3>TEAM MEMBERSHIPS</h3>
              <div className="info-row">
                <span className="info-label">ACTIVE TEAMS</span>
                <span className="info-value">
                  {userData?.teams?.length || 0}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">ROLES</span>
                <span className="info-value">
                  {userData?.roles?.length > 0 ? userData.roles.join(', ') : 'None'}
                </span>
              </div>
            </div>

            <div className="profile-section">
              <h3>DISCORD</h3>
              <DiscordLinkingSection user={user} showHeading={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

