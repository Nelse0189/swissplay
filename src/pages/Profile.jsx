import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import LoadingState from '../components/UI/LoadingState';
import './Profile.css';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const loadUserData = async (currentUser) => {
    if (!currentUser) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({
          ...data,
          // Ensure photoURL is prioritized from Firestore, then Auth
          photoURL: data.photoURL || currentUser.photoURL || null
        });
      } else {
        // Create default profile
        setUserData({
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email,
          photoURL: currentUser.photoURL || null,
          roles: [],
          createdAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await loadUserData(currentUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Reload user data when navigating back to profile page
  useEffect(() => {
    if (user && location.pathname === '/profile') {
      loadUserData(user);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

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
                  src={userData?.photoURL || user?.photoURL || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjYwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPHBhdGggZD0iTTYwIDM2QzQ4LjA0NDMgMzYgMzggNDYuMDQ0MyAzOCA1OEMzOCA2OS45NTU3IDQ4LjA0NDMgODAgNjAgODBDNzEuOTU1NyA4MCA4MiA2OS45NTU3IDgyIDU4QzgyIDQ2LjA0NDMgNzEuOTU1NyAzNiA2MCAzNlpNNjAgODRDMzkuNDg0NSA4NCAyNCA5NS4zNzI3IDI0IDEwOEg5NkM5NiA5NS4zNzI3IDgwLjUxNTUgODQgNjAgODRaIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNSkiLz4KPC9zdmc+'} 
                  alt={userData?.displayName || user?.displayName || 'Profile'}
                  className="profile-avatar-large"
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjYwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPHBhdGggZD0iTTYwIDM2QzQ4LjA0NDMgMzYgMzggNDYuMDQ0MyAzOCA1OEMzOCA2OS45NTU3IDQ4LjA0NDMgODAgNjAgODBDNzEuOTU1NyA4MCA4MiA2OS45NTU3IDgyIDU4QzgyIDQ2LjA0NDMgNzEuOTU1NyAzNiA2MCAzNlpNNjAgODRDMzkuNDg0NSA4NCAyNCA5NS4zNzI3IDI0IDEwOEg5NkM5NiA5NS4zNzI3IDgwLjUxNTUgODQgNjAgODRaIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNSkiLz4KPC9zdmc+';
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

