import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { collection, addDoc } from 'firebase/firestore';
import { useToast } from '../context/ToastContext';
import LoadingState from '../components/UI/LoadingState';
import CustomDropdown from '../components/UI/CustomDropdown';
import { OVERWATCH_RANK_OPTIONS } from '../constants/overwatchRanks';
import './CreateTeam.css';

const CreateTeam = () => {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    region: 'NA',
    sr: 'Champion 1',
    faceitDiv: 'Open'
  });

  const regionOptions = [
    { value: 'NA', label: 'North America' },
    { value: 'EU', label: 'Europe' },
    { value: 'OCE', label: 'Oceania' },
    { value: 'Asia', label: 'Asia' },
    { value: 'SA', label: 'South America' }
  ];

  const divisionOptions = [
    { value: 'OWCS', label: 'OWCS' },
    { value: 'Masters', label: 'Masters' },
    { value: 'Advanced', label: 'Advanced' },
    { value: 'Expert', label: 'Expert' },
    { value: 'Open', label: 'Open' }
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Generate abbreviation from team name
  const generateAbbreviation = (name) => {
    if (!name.trim()) return '';
    
    // Split by spaces and take first letter of each word
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
      // Single word: take first 3-4 uppercase letters
      return name.substring(0, Math.min(4, name.length)).toUpperCase();
    }
    // Multiple words: take first letter of each word
    return words.map(word => word.charAt(0).toUpperCase()).join('');
  };

  // Update abbreviation when team name changes
  const handleNameChange = (e) => {
    const newName = e.target.value;
    setFormData(prev => ({
      ...prev,
      name: newName,
      // Auto-generate abbreviation if it's empty or matches the old auto-generated one
      abbreviation: prev.abbreviation === generateAbbreviation(prev.name) || !prev.abbreviation
        ? generateAbbreviation(newName)
        : prev.abbreviation
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to create a team');
      navigate('/auth');
      return;
    }

    if (!formData.name.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    setSubmitting(true);
    try {
      const teamData = {
        ...formData,
        abbreviation: formData.abbreviation || generateAbbreviation(formData.name),
        ownerId: user.uid,
        members: [{
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          roles: ['Owner', 'Manager'],
          availability: []
        }],
        memberUids: [user.uid],
        managerDiscordIds: [],
        schedule: [],
        reliabilityScore: 100,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'teams'), teamData);
      toast.success(`Team "${formData.name}" created successfully!`);
      navigate('/teams/overwatch');
    } catch (error) {
      console.error('Error creating team:', error);
      toast.error('Failed to create team. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="create-team-page">
        <div className="content-wrapper">
          <div className="create-team-content">
            <LoadingState message="Loading..." />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="create-team-page">
        <div className="content-wrapper">
          <div className="create-team-content">
            <div className="auth-prompt-container">
              <h2>AUTHENTICATION REQUIRED</h2>
              <p>PLEASE SIGN IN TO CREATE A TEAM.</p>
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
    <div className="create-team-page">
      <div className="content-wrapper">
        <div className="create-team-content">
          <div className="create-team-header">
            <h1>CREATE A TEAM</h1>
          </div>

          <form onSubmit={handleSubmit} className="create-team-form">
            <div className="form-section">
              <h3>TEAM INFORMATION</h3>
              
              <div className="form-group">
                <label>TEAM NAME *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={handleNameChange}
                  className="custom-input"
                  placeholder="Enter team name"
                  required
                  disabled={submitting}
                />
                <p className="form-hint">Choose a unique name for your team</p>
              </div>

              <div className="form-group">
                <label>TEAM ABBREVIATION</label>
                <input
                  type="text"
                  value={formData.abbreviation}
                  onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value.toUpperCase() })}
                  className="custom-input"
                  placeholder="e.g. NFC"
                  maxLength="10"
                  disabled={submitting}
                />
                <p className="form-hint">Team abbreviation (auto-generated from name, e.g., "Niffe's Fan Club" = "NFC")</p>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>REGION *</label>
                  <CustomDropdown
                    options={regionOptions}
                    value={formData.region}
                    onChange={(value) => setFormData({ ...formData, region: value })}
                    disabled={submitting}
                  />
                </div>

                <div className="form-group">
                  <label>AVERAGE RANK</label>
                  <CustomDropdown
                    options={OVERWATCH_RANK_OPTIONS}
                    value={formData.sr}
                    onChange={(value) => setFormData({ ...formData, sr: value })}
                    disabled={submitting}
                  />
                  <p className="form-hint">Team's average Overwatch rank</p>
                </div>

                <div className="form-group">
                  <label>FACEIT DIVISION *</label>
                  <CustomDropdown
                    options={divisionOptions}
                    value={formData.faceitDiv}
                    onChange={(value) => setFormData({ ...formData, faceitDiv: value })}
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>TEAM OWNER</h3>
              <div className="info-row">
                <span className="info-label">OWNER</span>
                <span className="info-value">
                  {user.displayName || user.email?.split('@')[0] || 'User'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">EMAIL</span>
                <span className="info-value">{user.email}</span>
              </div>
              <p className="form-hint">
                You will be set as the Owner and Manager of this team. You can invite other players after creating the team.
              </p>
            </div>

            <div className="form-section">
              <h3>DISCORD BOT SETUP</h3>
              <div style={{ 
                padding: '1rem', 
                background: 'rgba(114, 137, 218, 0.1)', 
                border: '1px solid rgba(114, 137, 218, 0.3)',
                borderRadius: '4px',
                marginTop: '1rem'
              }}>
                <a 
                  href="https://discord.com/oauth2/authorize?client_id=1445440806797185129" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="save-btn secondary"
                  style={{ 
                    display: 'inline-block',
                    textDecoration: 'none',
                    textAlign: 'center',
                    width: '100%'
                  }}
                >
                  INVITE BOT TO DISCORD SERVER
                </a>
                <p style={{ 
                  color: 'var(--color-text-secondary, rgba(255, 255, 255, 0.6))', 
                  margin: '0.75rem 0 0 0', 
                  fontSize: '0.85rem', 
                  fontStyle: 'italic',
                  textAlign: 'center'
                }}>
                  You must be a server administrator or have "Manage Server" permissions to invite the bot.
                </p>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="save-btn secondary" onClick={() => navigate('/teams/overwatch')} disabled={submitting}>
                CANCEL
              </button>
              <button type="submit" className="save-btn" disabled={submitting}>
                {submitting ? 'CREATING TEAM...' : 'CREATE TEAM'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateTeam;

