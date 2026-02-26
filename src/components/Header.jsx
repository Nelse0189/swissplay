import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import NavigationDropdown from './UI/NavigationDropdown';
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
        },
        {
          label: 'Free Agents',
          onClick: () => navigate('/free-agents')
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
          <Link to="/">
            <svg className="logo-svg logo-swiss" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SwissPlay">
              <circle cx="20" cy="20" r="18" fill="#E41E26"/>
              <rect x="17" y="8" width="6" height="24" fill="white"/>
              <rect x="8" y="17" width="24" height="6" fill="white"/>
            </svg>
          </Link>
        </div>
        
        <nav className="nav">
          <Link to="/" className="nav-link">Home</Link>
          <NavigationDropdown 
            label="Teams" 
            sections={teamsSections}
          />
          <Link to="/scrims" className="nav-link">Find Scrims</Link>
          <Link to="/free-agents" className="nav-link">Free Agents</Link>
          {user && (
            <NavigationDropdown 
              label="Profile" 
              sections={profileSections}
            />
          )}
          <NavigationDropdown 
            label="Support" 
            items={supportItems}
          />
          {!user && (
            <Link to="/auth" className="nav-link">Sign In</Link>
          )}
        </nav>
        
        {user && (
          <div className="header-user-section">
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
