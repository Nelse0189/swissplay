import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import LoadingState from '../components/UI/LoadingState';
import CustomDropdown from '../components/UI/CustomDropdown';
import { OW_RANK_DIVISIONS, OW_RANK_OPTIONS_FOR_DROPDOWN, getRankLabel, getRankValueForSr } from '../utils/overwatchRanks';
import './FreeAgents.css';

const ROLES = ['Tank', 'DPS', 'Support', 'Flex'];
const REGIONS = ['NA', 'EU', 'OCE', 'Asia', 'SA'];
const OW_RANKS = OW_RANK_DIVISIONS; // alias for filter logic

// Mock free agents for local development / demo
const MOCK_FREE_AGENTS = [
  {
    id: 'mock-fa-1',
    uid: 'mock-fa-1',
    displayName: 'Alex Chen',
    photoURL: '/default-avatar.png',
    preferredRoles: ['Tank', 'Flex'],
    sr: 3250,
    region: 'NA',
    availability: 'Weekdays 6–10pm EST',
    discordTag: 'alexchen#2847',
    btag: 'AlexChen#11234',
    bio: 'Reinhardt and Winston main. 2 years competitive experience. Looking for a structured team with regular scrims.',
    status: 'active',
  },
  {
    id: 'mock-fa-2',
    uid: 'mock-fa-2',
    displayName: 'Jordan Blake',
    photoURL: '/default-avatar.png',
    preferredRoles: ['DPS'],
    sr: 3750,
    region: 'NA',
    availability: 'Mon/Wed/Fri 7–9pm, weekends flexible',
    discordTag: 'jblake',
    btag: 'JordanB#22891',
    bio: 'Hitscan specialist. Strong comms and ult tracking. Former Masters player looking to get back into the scene.',
    status: 'active',
  },
  {
    id: 'mock-fa-3',
    uid: 'mock-fa-3',
    displayName: 'Sam Rivera',
    photoURL: '/default-avatar.png',
    preferredRoles: ['Support', 'Flex'],
    sr: 2850,
    region: 'NA',
    availability: 'Evenings after 8pm EST',
    bio: 'Ana and Kiriko main. IGL experience. Prefer teams that value shot-calling and coordination.',
    status: 'active',
  },
  {
    id: 'mock-fa-4',
    uid: 'mock-fa-4',
    displayName: 'Morgan Hayes',
    photoURL: '/default-avatar.png',
    preferredRoles: ['Flex'],
    sr: 2150,
    region: 'EU',
    availability: 'Weekdays 7–11pm CET',
    bio: 'Comfortable on all roles. Gold/Plat level. New to competitive but eager to learn and improve.',
    status: 'active',
  },
  {
    id: 'mock-fa-5',
    uid: 'mock-fa-5',
    displayName: 'Riley Park',
    photoURL: '/default-avatar.png',
    preferredRoles: ['Tank', 'DPS'],
    sr: 4150,
    region: 'NA',
    availability: 'Tue/Thu/Sat 6–10pm PST',
    discordTag: 'rileypark#1923',
    bio: 'GM tank and DPS. OWL trials experience. Looking for a serious team aiming for contenders.',
    status: 'active',
  },
  {
    id: 'mock-fa-6',
    uid: 'mock-fa-6',
    displayName: 'Casey Dunn',
    photoURL: '/default-avatar.png',
    preferredRoles: ['Support'],
    sr: 3450,
    region: 'EU',
    availability: 'Weekends + Wed evenings',
    bio: 'Main support specialist. Lucio, Mercy, Brig. Strong macro play and peel. EU-based.',
    status: 'active',
  },
  {
    id: 'mock-fa-7',
    uid: 'mock-fa-7',
    displayName: 'Taylor Quinn',
    photoURL: '/default-avatar.png',
    preferredRoles: ['DPS', 'Flex'],
    sr: 2650,
    region: 'NA',
    availability: 'Flexible, prefer weekends',
    bio: 'Projectile DPS with flex to support. Good game sense, working on mechanics. Diamond goal.',
    status: 'active',
  },
  {
    id: 'mock-fa-8',
    uid: 'mock-fa-8',
    displayName: 'Jamie Foster',
    photoURL: '/default-avatar.png',
    preferredRoles: ['Tank'],
    sr: 3950,
    region: 'OCE',
    availability: 'AEST evenings, flexible weekends',
    bio: 'Off-tank main. Sigma, D.Va, Zarya. OCE player looking for NA or OCE team. Can adjust schedule.',
    status: 'active',
  },
  {
    id: 'mock-fa-9',
    uid: 'mock-fa-9',
    displayName: 'Marcus Webb',
    photoURL: '/default-avatar.png',
    listingType: 'coach',
    preferredRoles: ['Tank', 'DPS', 'Support'],
    sr: 4250,
    region: 'NA',
    availability: 'Weeknights 7–10pm EST, weekends',
    discordTag: 'mwebb_coach#5521',
    btag: 'CoachWebb#11892',
    bio: 'Former contenders coach. VOD review, macro strategy, and team building. Specializing in helping Gold–Diamond teams level up. Free initial consultation.',
    status: 'active',
  },
  {
    id: 'mock-fa-10',
    uid: 'mock-fa-10',
    displayName: 'Diana Torres',
    photoURL: '/default-avatar.png',
    listingType: 'coach',
    preferredRoles: ['Support', 'Flex'],
    sr: 3850,
    region: 'EU',
    availability: 'Flexible, prefer EU evenings',
    discordTag: 'dianatorres',
    bio: 'Support specialist coach. Individual and team sessions. Focus on positioning, ult tracking, and shot-calling. 3+ years coaching experience.',
    status: 'active',
  },
];

const FreeAgents = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('browse'); // 'list' | 'browse'
  const [freeAgents, setFreeAgents] = useState([]);
  const [myListing, setMyListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useMockData, setUseMockData] = useState(true);
  const navigate = useNavigate();

  // Form state for listing
  const [formData, setFormData] = useState({
    listingType: 'player',
    preferredRoles: [],
    sr: '',
    region: '',
    availability: '',
    bio: '',
    discordTag: '',
    btag: '',
  });

  // Filter state for browse
  const [filters, setFilters] = useState({
    listingType: '',
    role: '',
    region: '',
    minSr: '',
    maxSr: '',
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadFreeAgents();
  }, [useMockData]);

  useEffect(() => {
    if (user) {
      loadMyListing();
    } else {
      setMyListing(null);
    }
  }, [user]);

  const loadFreeAgents = async () => {
    setLoading(true);
    try {
      if (useMockData) {
        setFreeAgents(MOCK_FREE_AGENTS);
      } else {
        const snapshot = await getDocs(collection(db, 'freeAgents'));
        const agents = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((a) => a.status !== 'signed')
          .sort((a, b) => {
            const aTime = a.updatedAt?.toMillis?.() || 0;
            const bTime = b.updatedAt?.toMillis?.() || 0;
            return bTime - aTime;
          });
        setFreeAgents(agents);
      }
    } catch (error) {
      console.error('Error loading free agents:', error);
      setFreeAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMyListing = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'freeAgents', user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setMyListing({ id: snap.id, ...data });
        setFormData({
          listingType: data.listingType || 'player',
          preferredRoles: data.preferredRoles || [],
          sr: getRankValueForSr(data.sr),
          region: data.region || '',
          availability: data.availability || '',
          bio: data.bio || '',
          discordTag: data.discordTag || '',
          btag: data.btag || '',
        });
      } else {
        setMyListing(null);
      }
    } catch (error) {
      console.error('Error loading my listing:', error);
    }
  };

  const handleRoleToggle = (role) => {
    setFormData((prev) => ({
      ...prev,
      preferredRoles: prev.preferredRoles.includes(role)
        ? prev.preferredRoles.filter((r) => r !== role)
        : [...prev.preferredRoles, role],
    }));
  };

  const handleSubmitListing = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth');
      return;
    }
    setSaving(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const agentData = {
        uid: user.uid,
        displayName: userData.displayName || user.displayName || user.email?.split('@')[0] || 'Player',
        email: user.email || null,
        photoURL: userData.photoURL || user.photoURL || null,
        listingType: formData.listingType || 'player',
        preferredRoles: formData.preferredRoles.length ? formData.preferredRoles : ['Flex'],
        sr: formData.sr ? parseInt(formData.sr, 10) : null,
        region: formData.region || null,
        availability: formData.availability || null,
        bio: formData.bio || null,
        discordTag: formData.discordTag || null,
        btag: formData.btag || null,
        status: 'active',
        createdAt: myListing?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await setDoc(doc(db, 'freeAgents', user.uid), agentData);
      setMyListing({ id: user.uid, ...agentData });
      setActiveTab('browse');
      loadFreeAgents();
    } catch (error) {
      console.error('Error saving listing:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveListing = async () => {
    if (!user || !myListing) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'freeAgents', user.uid));
      setMyListing(null);
      setFormData({ listingType: 'player', preferredRoles: [], sr: '', region: '', availability: '', bio: '', discordTag: '', btag: '' });
      loadFreeAgents();
    } catch (error) {
      console.error('Error removing listing:', error);
    } finally {
      setSaving(false);
    }
  };

  const filteredAgents = freeAgents.filter((agent) => {
    const agentType = agent.listingType || 'player';
    if (filters.listingType && agentType !== filters.listingType) return false;
    if (filters.role && !(agent.preferredRoles || []).some((r) => r === filters.role || r === 'Flex'))
      return false;
    if (filters.region && agent.region !== filters.region) return false;
    const sr = agent.sr || 0;
    const minRank = OW_RANKS.find((r) => r.value === filters.minSr);
    const maxRank = OW_RANKS.find((r) => r.value === filters.maxSr);
    if (minRank?.min != null && sr < minRank.min) return false;
    if (maxRank?.max != null && sr > maxRank.max) return false;
    return true;
  });

  return (
    <div className="free-agents-page">
      <div className="content-wrapper">
        <div className="free-agents-content">
          <div className="free-agents-header">
            <div className="header-row">
              <div>
                <h1>FREE AGENTS</h1>
                <p className="subtitle">
                  Players looking for teams · Coaches offering services · Teams finding talent
                </p>
              </div>
              <button
                type="button"
                className={`mock-toggle-btn ${useMockData ? 'on' : ''}`}
                onClick={() => setUseMockData(!useMockData)}
                title={useMockData ? 'Using mock data' : 'Using live data'}
              >
                {useMockData ? 'MOCK: ON' : 'MOCK: OFF'}
              </button>
            </div>
          </div>

          <div className="tabs-row">
            <button
              className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              BROWSE FREE AGENTS
            </button>
            <button
              className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
              onClick={() => setActiveTab('list')}
            >
              {myListing ? 'EDIT MY LISTING' : 'LIST AS FREE AGENT'}
            </button>
          </div>

          {activeTab === 'list' && (
            <div className="list-section">
              {!user ? (
                <div className="auth-prompt">
                  <h3>SIGN IN TO LIST AS A FREE AGENT</h3>
                  <p>Create an account or sign in to add yourself to the free agent pool.</p>
                  <button className="save-btn" onClick={() => navigate('/auth')}>
                    SIGN IN
                  </button>
                </div>
              ) : (
                <form className="free-agent-form" onSubmit={handleSubmitListing}>
                  <div className="form-group">
                    <label>I AM A</label>
                    <div className="roles-row">
                      <button
                        type="button"
                        className={`role-chip ${formData.listingType === 'player' ? 'selected' : ''}`}
                        onClick={() => setFormData({ ...formData, listingType: 'player' })}
                      >
                        Player
                      </button>
                      <button
                        type="button"
                        className={`role-chip ${formData.listingType === 'coach' ? 'selected' : ''}`}
                        onClick={() => setFormData({ ...formData, listingType: 'coach' })}
                      >
                        Coach
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{formData.listingType === 'coach' ? 'ROLES I COACH' : 'PREFERRED ROLES'}</label>
                    <div className="roles-row">
                      {ROLES.map((role) => (
                        <button
                          key={role}
                          type="button"
                          className={`role-chip ${formData.preferredRoles.includes(role) ? 'selected' : ''}`}
                          onClick={() => handleRoleToggle(role)}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>RANK</label>
                      <CustomDropdown
                        options={OW_RANK_OPTIONS_FOR_DROPDOWN.map((r) => ({ value: r.value, label: r.label }))}
                        value={formData.sr}
                        onChange={(v) => setFormData({ ...formData, sr: v })}
                        placeholder="Select rank"
                      />
                    </div>
                    <div className="form-group">
                      <label>REGION</label>
                      <CustomDropdown
                        options={[
                          { value: '', label: 'Select region' },
                          ...REGIONS.map((r) => ({ value: r, label: r })),
                        ]}
                        value={formData.region}
                        onChange={(v) => setFormData({ ...formData, region: v })}
                        placeholder="Select region"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>AVAILABILITY</label>
                    <input
                      type="text"
                      placeholder="e.g. Weekdays 6-10pm, Mon/Wed/Fri 7-9pm"
                      value={formData.availability}
                      onChange={(e) => setFormData({ ...formData, availability: e.target.value })}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>DISCORD TAG</label>
                      <input
                        type="text"
                        placeholder="e.g. username#1234 or username"
                        value={formData.discordTag}
                        onChange={(e) => setFormData({ ...formData, discordTag: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>BATTLE.NET TAG</label>
                      <input
                        type="text"
                        placeholder="e.g. username#12345"
                        value={formData.btag}
                        onChange={(e) => setFormData({ ...formData, btag: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>BIO / PITCH</label>
                    <textarea
                      rows={4}
                      placeholder={formData.listingType === 'coach'
                        ? "Describe your coaching experience, services offered (VOD review, team sessions, etc.), and what you're looking for..."
                        : "Tell teams about yourself, your experience, and what you're looking for..."}
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="save-btn" disabled={saving}>
                      {saving ? 'SAVING...' : myListing ? 'UPDATE LISTING' : formData.listingType === 'coach' ? 'LIST COACHING SERVICES' : 'LIST AS FREE AGENT'}
                    </button>
                    {myListing && (
                      <button
                        type="button"
                        className="save-btn secondary danger"
                        onClick={handleRemoveListing}
                        disabled={saving}
                      >
                        REMOVE LISTING
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'browse' && (
            <div className="browse-section">
              <div className="filters-bar">
                <div className="filter-group">
                  <label>Type</label>
                  <CustomDropdown
                    options={[
                      { value: '', label: 'All' },
                      { value: 'player', label: 'Players' },
                      { value: 'coach', label: 'Coaches' },
                    ]}
                    value={filters.listingType}
                    onChange={(v) => setFilters({ ...filters, listingType: v })}
                    placeholder="All"
                  />
                </div>
                <div className="filter-group">
                  <label>Role</label>
                  <CustomDropdown
                    options={[
                      { value: '', label: 'All roles' },
                      ...ROLES.map((r) => ({ value: r, label: r })),
                    ]}
                    value={filters.role}
                    onChange={(v) => setFilters({ ...filters, role: v })}
                    placeholder="All roles"
                  />
                </div>
                <div className="filter-group">
                  <label>Region</label>
                  <CustomDropdown
                    options={[
                      { value: '', label: 'All regions' },
                      ...REGIONS.map((r) => ({ value: r, label: r })),
                    ]}
                    value={filters.region}
                    onChange={(v) => setFilters({ ...filters, region: v })}
                    placeholder="All regions"
                  />
                </div>
                <div className="filter-group">
                  <label>Min rank</label>
                  <CustomDropdown
                    options={[
                      { value: '', label: 'Any' },
                      ...OW_RANK_OPTIONS_FOR_DROPDOWN.slice(1).map((r) => ({
                        value: r.value,
                        label: r.label,
                      })),
                    ]}
                    value={filters.minSr}
                    onChange={(v) => setFilters({ ...filters, minSr: v })}
                    placeholder="Any"
                  />
                </div>
                <div className="filter-group">
                  <label>Max rank</label>
                  <CustomDropdown
                    options={[
                      { value: '', label: 'Any' },
                      ...OW_RANK_OPTIONS_FOR_DROPDOWN.slice(1).map((r) => ({
                        value: r.value,
                        label: r.label,
                      })),
                    ]}
                    value={filters.maxSr}
                    onChange={(v) => setFilters({ ...filters, maxSr: v })}
                    placeholder="Any"
                  />
                </div>
              </div>

              {loading ? (
                <LoadingState message="Loading free agents..." />
              ) : filteredAgents.length === 0 ? (
                <div className="empty-state">
                  <h3>NO FREE AGENTS FOUND</h3>
                  <p>
                    {freeAgents.length === 0
                      ? 'Be the first to list yourself as a free agent!'
                      : 'Try adjusting your filters.'}
                  </p>
                </div>
              ) : (
                <div className="agents-grid">
                  {filteredAgents.map((agent) => (
                    <div key={agent.id} className="agent-card">
                      <div className="agent-avatar-wrap">
                        <img
                          src={agent.photoURL || '/default-avatar.png'}
                          alt={agent.displayName}
                          onError={(e) => {
                            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PHBhdGggZD0iTTQwIDI0YzguODM3IDAgMTYgNy4xNjMgMTYgMTZzLTcuMTYzIDE2LTE2IDE2LTE2LTcuMTYzLTE2LTE2IDcuMTYzLTE2IDE2LTE2ek00MCA0OGMtMTMuMjU1IDAtMjQgOC45MzctMjQgMjBoNDhjMC0xMS4wNjMtMTAuNzQ1LTIwLTI0LTIweiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjUpIi8+PC9zdmc+';
                          }}
                        />
                      </div>
                      <div className="agent-info">
                        <h3>
                          {agent.displayName || 'Unknown'}
                          {(agent.listingType || 'player') === 'coach' && (
                            <span className="listing-type-badge coach">Coach</span>
                          )}
                        </h3>
                        <div className="agent-meta">
                          {(agent.preferredRoles || []).length > 0 && (
                            <span className="meta-tag roles">
                              {(agent.preferredRoles || []).join(', ')}
                            </span>
                          )}
                          {agent.sr && <span className="meta-tag sr">{getRankLabel(agent.sr)}</span>}
                          {agent.region && <span className="meta-tag region">{agent.region}</span>}
                        </div>
                        {agent.availability && (
                          <p className="agent-availability">{agent.availability}</p>
                        )}
                        {(agent.discordTag || agent.btag) && (
                          <p className="agent-contacts">
                            {agent.discordTag && <span>Discord: {agent.discordTag}</span>}
                            {agent.discordTag && agent.btag && ' · '}
                            {agent.btag && <span>Bnet: {agent.btag}</span>}
                          </p>
                        )}
                        {agent.bio && (
                          <p className="agent-bio">{agent.bio}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FreeAgents;
