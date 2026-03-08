import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import NavigationDropdown from './UI/NavigationDropdown';
import InboxDropdown from './UI/InboxDropdown';
import './Header.css';

const Header = () => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadUserTeams(currentUser.uid);
        // Load user profile data for profile picture
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          }
        } catch (error) {
          console.error('Error loading user data:', error);
        }
      } else {
        setUserTeams([]);
        setUserData(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadUserTeams = async (uid) => {
    try {
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      const teamsData = teamsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => t.members?.some(m => m.uid === uid));
      setUserTeams(teamsData);
    } catch (error) {
      console.error('Error loading user teams:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const teamsSections = [
    {
      label: 'TEAM ACTIONS',
      items: [
        {
          label: 'Create a team',
          onClick: () => navigate('/teams/create')
        },
        {
          label: 'Join a team',
          onClick: () => navigate('/teams/join')
        }
      ]
    },
    ...(userTeams.length > 0 ? [{
      label: 'YOUR TEAMS',
      items: userTeams.map(team => ({
        label: team.name,
        photoURL: team.photoURL,
        onClick: () => navigate('/teams/overwatch')
      }))
    }] : [])
  ];

  const profileSections = [
    {
      label: 'PROFILE',
      items: [
        {
          label: 'Profile',
          onClick: () => navigate('/profile')
        },
        {
          label: 'Edit Profile',
          onClick: () => navigate('/profile/edit')
        }
      ]
    }
  ];

  const supportItems = [
    {
      label: 'Help',
      onClick: () => navigate('/help')
    },
    {
      label: 'Contact',
      onClick: () => navigate('/contact')
    },
    {
      label: 'Website Theme',
      onClick: () => navigate('/theme')
    }
  ];

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-container">
          <Link to="/" className="logo-link">
            <svg className="logo-svg logo-swiss" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SwissPlay">
              <defs>
                <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF3B42" />
                  <stop offset="100%" stopColor="#C81A22" />
                </linearGradient>
              </defs>
              <g transform="translate(20, 20) skewX(-12) translate(-20, -20)">
                {/* Dynamic angled play button with rounded corners */}
                <path d="M 11 7 L 33 20 L 11 33 Z" fill="url(#brandGrad)" stroke="url(#brandGrad)" strokeWidth="6" strokeLinejoin="round" />
                
                {/* Perfect Swiss Cross Knockout */}
                <path d="M 16 14 H 20 V 18 H 24 V 22 H 20 V 26 H 16 V 22 H 12 V 18 H 16 V 14 Z" fill="#FFFFFF" />
              </g>
            </svg>
            <span className="logo-text">SWISSPLAY</span>
          </Link>
        </div>
        
        <nav className="nav">
          <Link to="/" className="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Home
          </Link>
          <NavigationDropdown 
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                Teams
              </span>
            } 
            sections={teamsSections}
          />
          <Link to="/scrims" className="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Find Scrims
          </Link>
          <Link to="/free-agents" className="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            LFT
          </Link>
          {user && (
            <NavigationDropdown 
              label={
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  Profile
                </span>
              } 
              sections={profileSections}
            />
          )}
          <NavigationDropdown 
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Support
              </span>
            } 
            items={supportItems}
          />
          {!user && (
            <Link to="/auth" className="nav-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Sign In
            </Link>
          )}
        </nav>
        
        {user && (
          <div className="header-user-section">
            <InboxDropdown user={user} />
            <Link to={`/profile/${user.uid}`} className="user-profile-link">
              <div>
                <img 
                  src={userData?.photoURL || user.photoURL || '/default-avatar.png'} 
                  alt="Profile" 
                  className="user-avatar"
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPgo8cGF0aCBkPSJNMjAgMTJDMTYuNjgxMiAxMiAxNCAxNC42ODEyIDE0IDE4QzE0IDIxLjMxODggMTYuNjgxMiAyNCAyMCAyNEMyMy4zMTg4IDI0IDI2IDIxLjMxODggMjYgMThDMjYgMTQuNjgxMiAyMy4zMTg4IDEyIDIwIDEyWk0yMCAyOEMxNS41ODE1IDI4IDEyIDI5Ljc5MDkgMTIgMzJWNDBIMjhWMzJDMjggMjkuNzkwOSAyNC40MTg1IDI4IDIwIDI4WiIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjUpIi8+Cjwvc3ZnPg==';
                  }}
                />
              </div>
              <span className="user-name">{userData?.displayName || user.displayName || user.email?.split('@')[0] || 'User'}</span>
            </Link>
            <span className="separator">|</span>
            <button onClick={handleSignOut} className="sign-out-btn-header">Sign Out</button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
