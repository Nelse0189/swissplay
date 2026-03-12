import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, addDoc, getDocs, doc, updateDoc, query, where, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useToast } from '../context/ToastContext';
import { createNotification } from '../utils/notifications';
import ScheduleTab from '../components/TeamDashboard/ScheduleTab';
import AvailabilityTab from '../components/TeamDashboard/AvailabilityTab';
import SettingsTab from '../components/TeamDashboard/SettingsTab';
import ScrimLogTab from '../components/TeamDashboard/ScrimLogTab';
import CustomDropdown from '../components/UI/CustomDropdown';
import CustomTabs from '../components/UI/CustomTabs';
import { OVERWATCH_RANK_OPTIONS } from '../constants/overwatchRanks';
import LoadingState from '../components/UI/LoadingState';
import '../components/TeamDashboard/TeamDashboard.css';

const TeamManagement = () => {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('schedule');
  
  // Creation State
  const [newTeamData, setNewTeamData] = useState({
    name: '',
    region: 'NA',
    sr: 'Champion 1',
    faceitDiv: 'Open'
  });

  const regionOptions = [
    { value: 'NA', label: 'North America' },
    { value: 'EU', label: 'Europe' },
    { value: 'KR', label: 'Korea' },
    { value: 'CN', label: 'China' }
  ];

  const divisionOptions = [
    { value: 'OWCS', label: 'OWCS' },
    { value: 'Masters', label: 'Masters' },
    { value: 'Advanced', label: 'Advanced' },
    { value: 'Expert', label: 'Expert' },
    { value: 'Open', label: 'Open' }
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        loadUserTeams(user.uid);
      } else {
        setUserTeams([]);
        setSelectedTeamId(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (userTeams.length > 0 && searchParams.get('team')) {
      const teamFromUrl = searchParams.get('team');
      if (userTeams.some(t => t.id === teamFromUrl) && teamFromUrl !== selectedTeamId) {
        setSelectedTeamId(teamFromUrl);
      }
    }
  }, [searchParams]);

  const userTeam = selectedTeamId ? userTeams.find(t => t.id === selectedTeamId) || null : (userTeams[0] || null);

  const handleTeamChange = (teamId) => {
    setSelectedTeamId(teamId || null);
    if (teamId) {
      setSearchParams({ team: teamId });
    } else {
      setSearchParams({});
    }
  };

  const loadUserTeams = async (uid) => {
    try {
      const teamsRef = collection(db, 'teams');
      const snapshot = await getDocs(teamsRef);
      const teams = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => t.members?.some(m => m.uid === uid));

      setUserTeams(teams);
      if (teams.length > 0) {
        const teamFromUrl = searchParams.get('team');
        const validFromUrl = teamFromUrl && teams.some(t => t.id === teamFromUrl);
        setSelectedTeamId(validFromUrl ? teamFromUrl : teams[0].id);
      } else {
        setSelectedTeamId(null);
      }
    } catch (error) {
      console.error("Error loading team:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamData.name.trim()) return;

    try {
      const teamData = {
        ...newTeamData,
        ownerId: currentUser.uid,
        members: [{
          uid: currentUser.uid,
          name: currentUser.displayName || currentUser.email.split('@')[0],
          roles: ['Owner', 'Manager'],
          availability: []
        }],
        memberUids: [currentUser.uid],
        schedule: [],
        reliabilityScore: 100,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'teams'), teamData);
      const newTeam = { id: docRef.id, ...teamData };
      setUserTeams(prev => [...prev, newTeam]);
      setSelectedTeamId(docRef.id);
    } catch (error) {
      console.error("Error creating team:", error);
      toast.error("Failed to create team");
    }
  };

  const updateAvailability = async (newAvailability) => {
    if (!userTeam || !currentUser) return;

    try {
      const updatedMembers = userTeam.members.map(m => {
        if (m.uid === currentUser.uid) {
          return { ...m, availability: newAvailability };
        }
        return m;
      });

      await updateDoc(doc(db, 'teams', userTeam.id), {
        members: updatedMembers
      });

      setUserTeams(prev => prev.map(t => t.id === userTeam.id ? { ...t, members: updatedMembers } : t));
      
      // Notify managers
      userTeam.members.forEach(m => {
        if ((m.roles?.includes('Manager') || m.roles?.includes('Owner')) && m.uid !== currentUser.uid) {
          createNotification(m.uid, {
            type: 'availability_change',
            title: 'Availability Updated',
            message: `${currentUser.displayName || currentUser.email?.split('@')[0] || 'A team member'} updated their availability.`,
            actionData: { teamId: userTeam.id }
          });
        }
      });
    } catch (error) {
      console.error("Error updating availability:", error);
    }
  };

  const updateTeamSchedule = async (newSchedule) => {
    try {
      await updateDoc(doc(db, 'teams', userTeam.id), { schedule: newSchedule });
      setUserTeams(prev => prev.map(t => t.id === userTeam.id ? { ...t, schedule: newSchedule } : t));
    } catch (error) {
      console.error("Error updating team schedule:", error);
      toast.error("Failed to save team availability");
    }
  };

  const updateSkillRange = async (newSkillRange) => {
    if (!userTeam || !currentUser) return;

    try {
      const updatedMembers = userTeam.members.map(m => {
        if (m.uid === currentUser.uid) {
          return { ...m, skillRange: newSkillRange };
        }
        return m;
      });

      await updateDoc(doc(db, 'teams', userTeam.id), {
        members: updatedMembers
      });

      setUserTeams(prev => prev.map(t => t.id === userTeam.id ? { ...t, members: updatedMembers } : t));
    } catch (error) {
      console.error("Error updating skill range:", error);
    }
  };

  const updateTeamSettings = async (settings) => {
    try {
      await updateDoc(doc(db, 'teams', userTeam.id), settings);
      setUserTeams(prev => prev.map(t => t.id === userTeam.id ? { ...t, ...settings } : t));
      toast.success("Team settings updated!");
    } catch (error) {
      console.error("Error updating settings:", error);
      toast.error("Failed to update settings");
    }
  };

  const PageWrapper = ({ children }) => (
    <div className="team-dashboard-page">
      <div className="content-wrapper">
        <div className="dashboard-content">
          {children}
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <PageWrapper>
      <LoadingState message="Loading data..." />
    </PageWrapper>
  );

  if (!currentUser) {
    return (
      <PageWrapper>
        <div className="auth-prompt-container">
          <h2>AUTHENTICATION REQUIRED</h2>
          <p>PLEASE SIGN IN TO ACCESS TEAM COMMAND.</p>
        </div>
      </PageWrapper>
    );
  }

  if (!userTeam) {
    return (
      <PageWrapper>
        <div className="create-team-container">
          <h2>INITIATE TEAM PROTOCOL</h2>
          <form onSubmit={handleCreateTeam}>
            <div className="form-group">
              <label>TEAM NAME</label>
              <input 
                type="text" 
                value={newTeamData.name}
                onChange={(e) => setNewTeamData({...newTeamData, name: e.target.value})}
                required 
                placeholder="ENTER TEAM DESIGNATION"
                className="custom-input"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>REGION</label>
                <CustomDropdown 
                  options={regionOptions}
                  value={newTeamData.region}
                  onChange={(val) => setNewTeamData({...newTeamData, region: val})}
                />
              </div>
              <div className="form-group">
                <label>AVERAGE RANK</label>
                <CustomDropdown
                  options={OVERWATCH_RANK_OPTIONS}
                  value={newTeamData.sr}
                  onChange={(val) => setNewTeamData({...newTeamData, sr: val})}
                />
              </div>
            </div>
            <div className="form-group">
              <label>FACEIT DIVISION</label>
              <CustomDropdown 
                options={divisionOptions}
                value={newTeamData.faceitDiv}
                onChange={(val) => setNewTeamData({...newTeamData, faceitDiv: val})}
              />
            </div>
            <button type="submit" className="save-btn full-width">INITIALIZE TEAM</button>
          </form>
        </div>
      </PageWrapper>
    );
  }

  const myMember = userTeam.members.find(m => m.uid === currentUser.uid);
  const myRoles = myMember?.roles || [];
  const isManager = myRoles.includes('Manager') || myRoles.includes('Owner');
  const isOwner = myRoles.includes('Owner');
  const isPlayer = myRoles.includes('Player');
  const isCoach = myRoles.includes('Coach');

  const canEditAvailability = isPlayer || isCoach || isManager;
  const canEditSettings = isManager || isOwner;

  const tabs = [
    { 
      id: 'schedule', 
      label: 'SCHEDULE',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.2em', height: '1.2em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      )
    },
    ...(canEditAvailability ? [{ 
      id: 'availability', 
      label: 'AVAILABILITY',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.2em', height: '1.2em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      )
    }] : []),
    ...(canEditSettings ? [{ 
      id: 'settings', 
      label: 'SETTINGS',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.2em', height: '1.2em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      )
    }] : [])
  ];

  return (
    <PageWrapper>
      <div className="dashboard-header">
        <div className="header-top">
          {userTeams.length > 1 && (
            <div className="team-switcher" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>SWITCH TEAM</label>
              <CustomDropdown
                options={userTeams.map(t => ({ value: t.id, label: t.name }))}
                value={selectedTeamId || ''}
                onChange={(v) => handleTeamChange(v || null)}
                placeholder="Select team"
              />
            </div>
          )}
          <div className="team-header-content">
            <div className="team-avatar-section">
              <img 
                src={userTeam.photoURL || '/default-team.svg'} 
                alt={userTeam.name}
                className="team-avatar-large"
                onError={(e) => {
                  e.target.src = '/default-team.svg';
                }}
              />
            </div>
            <div className="team-header-text">
              <h1>{userTeam.name}</h1>
              <div className="team-badges">
                <span className="badge">{userTeam.region}</span>
                {userTeam.sr && <span className="badge">{typeof userTeam.sr === 'number' ? `SR ${userTeam.sr}` : userTeam.sr}</span>}
                {userTeam.faceitDiv && <span className="badge">{userTeam.faceitDiv}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <CustomTabs 
        tabs={tabs} 
        activeTab={activeTab} 
        onChange={setActiveTab} 
      />

      <div className="tab-content-container">
        {activeTab === 'schedule' && (
          <ScheduleTab 
            team={userTeam} 
            members={userTeam.members} 
            currentUser={currentUser}
          />
        )}
        
        {activeTab === 'availability' && (
          <AvailabilityTab 
            currentUser={currentUser}
            team={userTeam}
            updateAvailability={updateAvailability}
            updateSkillRange={updateSkillRange}
            updateTeamSettings={updateTeamSettings}
            updateTeamSchedule={updateTeamSchedule}
            canEditSettings={canEditSettings}
          />
        )}

        {/* activeTab === 'scrim-logs' && (
          <ScrimLogTab 
            team={userTeam}
            currentUser={currentUser}
          />
        ) */}
        
        {activeTab === 'settings' && canEditSettings && (
          <SettingsTab 
            team={userTeam}
            updateTeamSettings={updateTeamSettings}
            currentUser={currentUser}
          />
        )}
      </div>
    </PageWrapper>
  );
};

export default TeamManagement;
