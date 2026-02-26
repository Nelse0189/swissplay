import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, query, where, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useToast } from '../context/ToastContext';
import ScheduleTab from '../components/TeamDashboard/ScheduleTab';
import AvailabilityTab from '../components/TeamDashboard/AvailabilityTab';
import SettingsTab from '../components/TeamDashboard/SettingsTab';
import ScrimLogTab from '../components/TeamDashboard/ScrimLogTab';
import CustomDropdown from '../components/UI/CustomDropdown';
import CustomTabs from '../components/UI/CustomTabs';
import LoadingState from '../components/UI/LoadingState';
import '../components/TeamDashboard/TeamDashboard.css';

const TeamManagement = () => {
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [userTeam, setUserTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('schedule');
  
  // Creation State
  const [newTeamData, setNewTeamData] = useState({
    name: '',
    region: 'NA',
    sr: '',
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
        loadUserTeam(user.uid);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadUserTeam = async (uid) => {
    try {
      const teamsRef = collection(db, 'teams');
      const snapshot = await getDocs(teamsRef);
      const team = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(t => t.members.some(m => m.uid === uid));

      setUserTeam(team || null);
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
      setUserTeam({ id: docRef.id, ...teamData });
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

      const newSchedule = generateSchedule(updatedMembers);

      await updateDoc(doc(db, 'teams', userTeam.id), {
        members: updatedMembers,
        schedule: newSchedule
      });

      setUserTeam({ ...userTeam, members: updatedMembers, schedule: newSchedule });
    } catch (error) {
      console.error("Error updating availability:", error);
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

      setUserTeam({ ...userTeam, members: updatedMembers });
    } catch (error) {
      console.error("Error updating skill range:", error);
    }
  };

  const updateTeamSettings = async (settings) => {
    try {
      await updateDoc(doc(db, 'teams', userTeam.id), settings);
      setUserTeam({ ...userTeam, ...settings });
      toast.success("Team settings updated!");
    } catch (error) {
      console.error("Error updating settings:", error);
      toast.error("Failed to update settings");
    }
  };

  const generateSchedule = (members) => {
    if (members.length === 0) return [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const commonSlots = [];
    
    days.forEach(day => {
      hours.forEach(hour => {
        const slotKey = `${day}-${hour}`;
        const allAvailable = members.every(member => 
          member.availability && member.availability.includes(slotKey)
        );
        
        if (allAvailable) {
          commonSlots.push({ day, hour });
        }
      });
    });
    return commonSlots;
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
                <label>CURRENT SR</label>
                <input 
                  type="number" 
                  value={newTeamData.sr}
                  onChange={(e) => setNewTeamData({...newTeamData, sr: e.target.value})}
                  placeholder="AVG SR"
                  className="custom-input"
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

  // Define tabs for CustomTabs component
  const tabs = [
    { id: 'schedule', label: 'SCHEDULE' },
    ...(canEditAvailability ? [{ id: 'availability', label: 'AVAILABILITY' }] : []),
    { id: 'scrim-logs', label: 'SCRIM LOGS' },
    ...(canEditSettings ? [{ id: 'settings', label: 'SETTINGS' }] : [])
  ];

  return (
    <PageWrapper>
      <div className="dashboard-header">
        <div className="header-top">
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
                {userTeam.sr && <span className="badge">SR {userTeam.sr}</span>}
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
          />
        )}

        {activeTab === 'scrim-logs' && (
          <ScrimLogTab 
            team={userTeam}
            currentUser={currentUser}
          />
        )}
        
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
