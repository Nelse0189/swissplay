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
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/UI/LoadingState';
import CustomDropdown from '../components/UI/CustomDropdown';
import LftInviteModal from '../components/UI/LftInviteModal';
import { useToast } from '../context/ToastContext';
import { OW_RANK_DIVISIONS, OW_RANK_OPTIONS_FOR_DROPDOWN, getRankLabel, getRankValueForSr } from '../utils/overwatchRanks';
import { REGION_FORM_OPTIONS, REGION_FILTER_BROWSE_OPTIONS, getRegionDisplay } from '../constants/regions';
import './FreeAgents.css';

const ROLES = ['Tank', 'DPS', 'Support', 'Flex'];
const OW_RANKS = OW_RANK_DIVISIONS; // alias for filter logic

const FreeAgents = () => {
  const { userData } = useAuth();
  const [user, setUser] = useState(null);
  const [isModerator, setIsModerator] = useState(false);
  const [activeTab, setActiveTab] = useState('browse'); // 'list' | 'browse'
  const [freeAgents, setFreeAgents] = useState([]);
  const [myListing, setMyListing] = useState(null);
  const [managerTeams, setManagerTeams] = useState([]);
  const [inviteModal, setInviteModal] = useState({ isOpen: false, agent: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  // Form state for listing
  const [formData, setFormData] = useState({
    listingType: 'player',
    selectedTeamId: '',
    teamName: '',
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
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
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
    loadFreeAgents();
  }, []);

  useEffect(() => {
    if (user) {
      loadMyListing();
      loadUserTeams();
    } else {
      setMyListing(null);
      setManagerTeams([]);
    }
  }, [user, userData]);

  const loadUserTeams = async () => {
    if (!user) return;
    try {
      // Prefer discordId from AuthContext (loaded with profile), fallback to fetching userDoc
      let userDiscordId = userData?.discordId ?? null;
      if (!userDiscordId) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().discordId) {
            userDiscordId = userDoc.data().discordId;
          }
        } catch {
          // Ignore
        }
      }
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      const uid = user.uid;
      const userEmail = user.email?.toLowerCase?.();
      const managedTeams = teamsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => {
          if (t.ownerId == uid) return true;  // loose eq for Firestore type mismatch
          if (userDiscordId && t.managerDiscordIds?.some(id => String(id) === String(userDiscordId))) return true;
          if (t.memberUids?.includes(uid)) {
            const m = t.members?.find(mem => mem.uid === uid);
            if (m && (m.roles?.includes('Manager') || m.roles?.includes('Owner'))) return true;
          }
          const member = t.members?.find(m => {
            if (m.uid === uid) return true;
            if (userDiscordId && String(m.discordId) === String(userDiscordId)) return true;
            if (userEmail && m.email?.toLowerCase?.() === userEmail) return true;
            return false;
          });
          if (!member) return false;
          return member.roles?.includes('Manager') || member.roles?.includes('Owner');
        });
      setManagerTeams(managedTeams);
    } catch (error) {
      console.error('Error loading user teams:', error);
    }
  };

  const loadFreeAgents = async () => {
    setLoading(true);
    try {
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
          teamName: data.teamName || '',
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
        teamName: formData.listingType === 'team' ? formData.teamName : null,
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
      setFormData({ listingType: 'player', teamName: '', preferredRoles: [], sr: '', region: '', availability: '', bio: '', discordTag: '', btag: '' });
      loadFreeAgents();
    } catch (error) {
      console.error('Error removing listing:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleModerateRemoveListing = async (listingId) => {
    if (!isModerator) return;
    if (!window.confirm('Are you sure you want to remove this listing as a moderator?')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'freeAgents', listingId));
      if (myListing && myListing.id === listingId) {
        setMyListing(null);
        setFormData({ listingType: 'player', teamName: '', preferredRoles: [], sr: '', region: '', availability: '', bio: '', discordTag: '', btag: '' });
      }
      await loadFreeAgents();
      toast.success('Listing removed successfully');
    } catch (error) {
      console.error('Error removing listing (moderator):', error);
      toast.error('Failed to remove listing. You may not have permission.');
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
                <h1>LFT / LFP</h1>
                <p className="subtitle">
                  Players looking for teams · Teams finding talent · Coaches offering services
                </p>
              </div>
            </div>
          </div>

          <div className="tabs-row">
            <button
              className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              BROWSE LISTINGS
            </button>
            <button
              className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
              onClick={() => setActiveTab('list')}
            >
              {myListing ? 'EDIT MY LISTING' : 'CREATE LISTING'}
            </button>
          </div>

          {activeTab === 'list' && (
            <div className="list-section">
              {!user ? (
                <div className="auth-prompt">
                  <h3>SIGN IN TO CREATE A LISTING</h3>
                  <p>Create an account or sign in to add yourself or your team to the pool.</p>
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
                        Player (LFT)
                      </button>
                      <button
                        type="button"
                        className={`role-chip ${formData.listingType === 'team' ? 'selected' : ''}`}
                        onClick={() => setFormData({ ...formData, listingType: 'team' })}
                      >
                        Team (LFP)
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
                  
                  {formData.listingType === 'team' && (
                    <div className="form-group">
                      <label>TEAM</label>
                      {managerTeams.length > 0 ? (
                        <>
                          <CustomDropdown
                            options={[
                              { value: '', label: 'Select your team' },
                              ...managerTeams.map(t => ({ value: t.id, label: t.name })),
                              ...(formData.selectedTeamId && formData.selectedTeamId !== 'manual' && !managerTeams.find(t => t.id === formData.selectedTeamId)
                                ? [{ value: formData.selectedTeamId, label: formData.teamName || 'Unknown Team' }]
                                : []),
                              { value: 'manual', label: 'Other (type name manually)' },
                            ]}
                            value={formData.selectedTeamId || (formData.teamName ? 'manual' : '')}
                            onChange={(v) => setFormData({
                              ...formData,
                              selectedTeamId: v,
                              teamName: v && v !== 'manual' ? (managerTeams.find(t => t.id === v)?.name || formData.teamName) : formData.teamName,
                            })}
                            placeholder="Select your team"
                          />
                          {formData.selectedTeamId === 'manual' && (
                            <input
                              type="text"
                              placeholder="Enter your team's name"
                              value={formData.teamName}
                              onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                              required
                              style={{ marginTop: '0.5rem' }}
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="Enter your team's name"
                            value={formData.teamName}
                            onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                            required
                          />
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                            No teams found. If you manage via Discord, link your account in <a href="/profile/edit" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Profile → Edit Profile</a>.
                          </p>
                        </>
                      )}
                      {managerTeams.length > 0 && !formData.selectedTeamId && !formData.teamName && (
                        <span className="form-hint" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                          Required
                        </span>
                      )}
                      {managerTeams.length === 0 && (
                        <span className="form-hint" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem', display: 'block' }}>
                          If you manage teams via Discord, link your account in Profile &gt; Edit Profile to see them here.
                        </span>
                      )}
                    </div>
                  )}

                  <div className="form-group">
                    <label>
                      {formData.listingType === 'coach' ? 'ROLES I COACH' : 
                       formData.listingType === 'team' ? 'ROLES NEEDED' : 
                       'PREFERRED ROLES'}
                    </label>
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
                      <label>{formData.listingType === 'team' ? 'AVERAGE RANK' : 'RANK'}</label>
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
                        options={REGION_FORM_OPTIONS('Select region')}
                        value={formData.region}
                        onChange={(v) => setFormData({ ...formData, region: v })}
                        placeholder="Select region"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{formData.listingType === 'team' ? 'PRACTICE / SCRIM SCHEDULE' : 'AVAILABILITY'}</label>
                    <input
                      type="text"
                      placeholder={formData.listingType === 'team' ? "e.g. Scrims Mon/Wed/Fri 8-10pm EST" : "e.g. Weekdays 6-10pm, Mon/Wed/Fri 7-9pm"}
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
                    <label>{formData.listingType === 'team' ? 'TEAM BIO / REQUIREMENTS' : 'BIO / PITCH'}</label>
                    <textarea
                      rows={4}
                      placeholder={formData.listingType === 'coach'
                        ? "Describe your coaching experience, services offered (VOD review, team sessions, etc.), and what you're looking for..."
                        : formData.listingType === 'team'
                        ? "Describe your team, goals, and what kind of players you are looking for..."
                        : "Tell teams about yourself, your experience, and what you're looking for..."}
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="save-btn" disabled={saving}>
                      {saving ? 'SAVING...' : myListing ? 'UPDATE LISTING' : formData.listingType === 'coach' ? 'LIST COACHING SERVICES' : formData.listingType === 'team' ? 'LIST TEAM (LFP)' : 'LIST AS PLAYER (LFT)'}
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
                      { value: 'player', label: 'Players (LFT)' },
                      { value: 'team', label: 'Teams (LFP)' },
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
                    options={REGION_FILTER_BROWSE_OPTIONS}
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
                <LoadingState message="Loading listings..." />
              ) : filteredAgents.length === 0 ? (
                <div className="empty-state">
                  <h3>NO LISTINGS FOUND</h3>
                  <p>
                    {freeAgents.length === 0
                      ? 'Be the first to create a listing!'
                      : 'Try adjusting your filters.'}
                  </p>
                </div>
              ) : (
                <div className="agents-grid">
                  {filteredAgents.map((agent) => (
                    <div key={agent.id} className="agent-card">
                      
                      <div className="agent-card-left">
                        <div className="agent-avatar-wrap">
                          <img
                            src={agent.photoURL || '/default-avatar.png'}
                            alt={agent.listingType === 'team' ? agent.teamName : agent.displayName}
                            onError={(e) => {
                              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PHBhdGggZD0iTTQwIDI0YzguODM3IDAgMTYgNy4xNjMgMTYgMTZzLTcuMTYzIDE2LTE2IDE2LTE2LTcuMTYzLTE2LTE2IDcuMTYzLTE2IDE2LTE2ek00MCA0OGMtMTMuMjU1IDAtMjQgOC45MzctMjQgMjBoNDhjMC0xMS4wNjMtMTAuNzQ1LTIwLTI0LTIweiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjUpIi8+PC9zdmc+';
                            }}
                          />
                        </div>
                        <div className="agent-primary-info">
                          <h3>
                            {agent.listingType === 'team' ? (agent.teamName || 'Unknown Team') : (agent.displayName || 'Unknown')}
                            {(agent.listingType || 'player') === 'coach' && (
                              <span className="listing-type-badge coach">Coach</span>
                            )}
                            {agent.listingType === 'team' && (
                              <span className="listing-type-badge team" style={{background: 'rgba(255, 193, 7, 0.25)', color: '#ffc107', border: '1px solid #ffc107'}}>Team (LFP)</span>
                            )}
                          </h3>
                          {agent.listingType === 'team' && agent.displayName && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '-0.25rem' }}>
                              Posted by {agent.displayName}
                            </span>
                          )}
                          <div className="agent-meta">
                            {(agent.preferredRoles || []).length > 0 && (
                              <span className="meta-tag roles">
                                {(agent.preferredRoles || []).join(', ')}
                              </span>
                            )}
                            {agent.sr && <span className="meta-tag sr">{getRankLabel(agent.sr)}</span>}
                            {agent.region && <span className="meta-tag region">{getRegionDisplay(agent.region)}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="agent-card-middle">
                        <div className="agent-schedule-contact">
                          {agent.availability && (
                            <div className="availability-block">
                              <span className="section-label">{agent.listingType === 'team' ? 'SCHEDULE' : 'AVAILABILITY'}</span>
                              <p className="agent-availability">{agent.availability}</p>
                            </div>
                          )}
                          {(agent.discordTag || agent.btag) && (
                            <div className="agent-contacts">
                              <span className="section-label">CONTACT INFO</span>
                              <div className="contact-list">
                                {agent.discordTag && (
                                  <span className="contact-item">
                                    <span className="contact-label">Discord:</span> {agent.discordTag}
                                  </span>
                                )}
                                {agent.btag && (
                                  <span className="contact-item">
                                    <span className="contact-label">Bnet:</span> {agent.btag}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="agent-card-right">
                        <span className="section-label">{agent.listingType === 'team' ? 'TEAM BIO / REQS' : 'BIO'}</span>
                        {agent.bio ? (
                          <p className="agent-bio">{agent.bio}</p>
                        ) : (
                          <p className="agent-bio empty">No bio provided.</p>
                        )}
                        {isModerator && (
                          <button
                            onClick={() => handleModerateRemoveListing(agent.id)}
                            style={{
                              marginTop: 'auto',
                              padding: '0.4rem 0.8rem',
                              backgroundColor: 'var(--color-danger, #ff4d4d)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              alignSelf: 'flex-start',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                            }}
                          >
                            REMOVE (MOD)
                          </button>
                        )}
                        {managerTeams.length > 0 && agent.listingType !== 'team' && agent.uid !== user?.uid && (
                          <button
                            onClick={() => setInviteModal({ isOpen: true, agent })}
                            className="save-btn"
                            style={{ marginTop: isModerator ? '0.5rem' : 'auto', alignSelf: 'flex-start' }}
                          >
                            INVITE TO TEAM
                          </button>
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

      <LftInviteModal 
        isOpen={inviteModal.isOpen}
        onClose={() => setInviteModal({ isOpen: false, agent: null })}
        agent={inviteModal.agent}
        managerTeams={managerTeams}
        currentUser={user}
      />
    </div>
  );
};

export default FreeAgents;
