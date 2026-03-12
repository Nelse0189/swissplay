import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../firebase/config';
import { useToast } from '../../context/ToastContext';
import CustomDropdown from '../UI/CustomDropdown';
import ImageCropper from '../UI/ImageCropper';
import Modal from '../UI/Modal';
import { OVERWATCH_RANK_OPTIONS } from '../../constants/overwatchRanks';

import DiscordLinkingInstructions from '../DiscordLinkingInstructions';

const SettingsTab = ({ team, updateTeamSettings, currentUser }) => {
  const toast = useToast();
  const [teamName, setTeamName] = useState(team.name);
  const [sr, setSr] = useState(() => {
    const v = team.sr;
    if (typeof v === 'string' && OVERWATCH_RANK_OPTIONS.some((o) => o.value === v)) return v;
    return 'Champion 1';
  });
  const [region, setRegion] = useState(team.region || 'NA');
  const [faceitDiv, setFaceitDiv] = useState(team.faceitDiv || 'Open');
  const [teamPhotoURL, setTeamPhotoURL] = useState(team.photoURL || '');
  const [photoPreview, setPhotoPreview] = useState(team.photoURL || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const fileInputRef = useRef(null);
  // Discord invite state (for inviting new players)
  const [inviteDiscordUsername, setInviteDiscordUsername] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  
  // Discord linking state (for self)
  const [discordUsername, setDiscordUsername] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkedDiscordId, setLinkedDiscordId] = useState(null);
  const [dmError, setDmError] = useState(null);
  const [showDiscordHelpModal, setShowDiscordHelpModal] = useState(false);
  const discordHelpCodeRef = useRef(''); // Ensures code is visible immediately when modal opens
  
  const [pendingVerifications, setPendingVerifications] = useState([]);
  
  // Check if user already has Discord linked
  useEffect(() => {
    if (team && auth.currentUser) {
      const myMember = team.members?.find(m => m.uid === auth.currentUser.uid);
      if (myMember?.discordId) {
        setLinkedDiscordId(myMember.discordId);
        setVerificationStatus('linked');
      }
    }
  }, [team]);
  
  // Check if current user is a manager
  const myMember = team.members?.find(m => m.uid === auth.currentUser?.uid);
  const isManager = myMember?.roles?.includes('Manager') || myMember?.roles?.includes('Owner');
  
  // Load pending verifications for team members
  useEffect(() => {
    if (!isManager || !team) return;
    
    const loadPendingVerifications = async () => {
      try {
        const verificationsRef = collection(db, 'discordVerifications');
        const q = query(
          verificationsRef,
          where('teamId', '==', team.id),
          where('status', '==', 'pending')
        );
        const snapshot = await getDocs(q);
        const pending = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPendingVerifications(pending);
      } catch (error) {
        console.error('Error loading pending verifications:', error);
      }
    };
    
    loadPendingVerifications();
    // Refresh every 5 seconds
    const interval = setInterval(loadPendingVerifications, 5000);
    return () => clearInterval(interval);
  }, [isManager, team]);
  
  // Listen for verification status changes
  useEffect(() => {
    if (!verificationCode) return;
    
    const verificationRef = doc(db, 'discordVerifications', verificationCode);
    const unsubscribe = onSnapshot(verificationRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        
        // Check if DM was sent
        if (data.dmSent === true && verificationStatus === 'pending') {
          setVerificationStatus('dm_sent');
          setDmError(null);
        } else if (data.dmError && !data.dmSent) {
          setDmError(data.dmError);
          setVerificationStatus('dm_failed');
        }
        
        if (data.status === 'confirmed') {
          setVerificationStatus('confirmed');
          setVerificationCode('');
          setDiscordUsername('');
          // Reload team data after a short delay to show updated Discord status
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else if (data.status === 'denied' || data.status === 'expired') {
          setVerificationStatus(data.status);
          // Allow creating new verification after denial/expiration
          setTimeout(() => {
            setVerificationStatus(null);
            setVerificationCode('');
            setDiscordUsername('');
          }, 3000);
        }
      }
    });
    
    return () => unsubscribe();
  }, [verificationCode, verificationStatus]);

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

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB.');
      return;
    }

    // Create preview and show cropper
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageToCrop(reader.result);
      setOriginalFile(file);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob) => {
    setShowCropper(false);
    setUploadingPhoto(true);
    
    try {
      // Upload cropped image to Firebase Storage as WebP
      // Determine file extension based on blob type
      const fileExtension = croppedBlob.type === 'image/webp' ? '.webp' : '.jpg';
      const fileName = `team_${Date.now()}${fileExtension}`;
      const storageRef = ref(storage, `team-photos/${team.id}/${fileName}`);
      await uploadBytes(storageRef, croppedBlob);
      const downloadURL = await getDownloadURL(storageRef);

      // Update team photo
      setTeamPhotoURL(downloadURL);
      setPhotoPreview(downloadURL);
      await updateDoc(doc(db, 'teams', team.id), { photoURL: downloadURL });
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
      setImageToCrop(null);
      setOriginalFile(null);
    }
  };

  const handleCancelCrop = () => {
    setShowCropper(false);
    setImageToCrop(null);
    setOriginalFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    updateTeamSettings({
      name: teamName,
      sr,
      region,
      faceitDiv,
      photoURL: teamPhotoURL
    });
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteDiscordUsername.trim()) {
      toast.error('Please enter a Discord username');
      return;
    }
    
    setIsInviting(true);
    
    try {
      const code = generateVerificationCode();
      const currentUser = auth.currentUser;
      
      // Clean username (remove # discriminator if present)
      const cleanUsername = inviteDiscordUsername.split('#')[0].trim();
      
      // Create invite verification document
      await setDoc(doc(db, 'discordVerifications', code), {
        discordUsername: cleanUsername,
        teamId: team.id,
        teamName: team.name,
        status: 'pending',
        createdAt: new Date(),
        dmSent: false,
        isInvite: true, // Mark as invite (not linking existing member)
        invitedBy: currentUser.uid,
        invitedByName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Manager'
      });
      
      // Clear form
      setInviteDiscordUsername('');
      
      // Refresh pending verifications
      const verificationsRef = collection(db, 'discordVerifications');
      const q = query(
        verificationsRef,
        where('teamId', '==', team.id),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      const pending = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingVerifications(pending);
      
      toast.success(`Invite sent to ${cleanUsername}. They will be added to the roster when they accept the Discord DM.`);
    } catch (error) {
      console.error('Error creating invite:', error);
      toast.error('Failed to send invite. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };
  
  const generateVerificationCode = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };
  
  const handleVerifyViaBot = async () => {
    setIsLinking(true);
    setVerificationStatus(null);
    setDmError(null);
    
    try {
      const code = generateVerificationCode();
      const currentUser = auth.currentUser;
      const myMember = team.members.find(m => m.uid === currentUser.uid);
      
      // Create manager verification document
      await setDoc(doc(db, 'discordVerifications', code), {
        userUid: currentUser.uid,
        userEmail: currentUser.email,
        userName: myMember?.name || currentUser.displayName || currentUser.email.split('@')[0],
        teamId: team.id,
        teamName: team.name,
        status: 'pending',
        createdAt: new Date(),
        dmSent: false,
        isManagerVerification: true // Mark as manager verification
      });
      
      discordHelpCodeRef.current = code; // Set ref first so code is visible when modal opens
      setVerificationCode(code);
      setVerificationStatus('pending');
      setShowDiscordHelpModal(true);
    } catch (error) {
      console.error('Error creating verification:', error);
      toast.error('Failed to create verification. Please try again.');
      setVerificationStatus('error');
    } finally {
      setIsLinking(false);
    }
  };

  const handleLinkDiscord = async () => {
    if (!discordUsername.trim()) {
      toast.error('Please enter your Discord username');
      return;
    }
    
    setIsLinking(true);
    setVerificationStatus(null);
    setDmError(null);
    
    try {
      const code = generateVerificationCode();
      const currentUser = auth.currentUser;
      const myMember = team.members.find(m => m.uid === currentUser.uid);
      
      // Clean username (remove # discriminator if present)
      const cleanUsername = discordUsername.split('#')[0].trim();
      
      // Create verification document with code as document ID
      // Bot will automatically search for user and send DM
      await setDoc(doc(db, 'discordVerifications', code), {
        discordUsername: cleanUsername,
        userUid: currentUser.uid,
        userEmail: currentUser.email,
        userName: myMember?.name || currentUser.displayName || currentUser.email.split('@')[0],
        teamId: team.id,
        teamName: team.name,
        status: 'pending',
        createdAt: new Date(),
        dmSent: false
      });
      
      discordHelpCodeRef.current = code; // Set ref first so code is visible when modal opens
      setVerificationCode(code);
      setVerificationStatus('pending');
      setShowDiscordHelpModal(true);
      
      // Wait a moment for the bot to process
      setTimeout(() => {
        if (verificationStatus === 'pending' && !dmError) {
          // Still pending, might be processing
        }
      }, 2000);
    } catch (error) {
      console.error('Error creating verification:', error);
      toast.error('Failed to create verification. Please try again.');
      setVerificationStatus('error');
    } finally {
      setIsLinking(false);
    }
  };
  

  return (
    <div className="settings-tab">
      <div className="settings-section">
        <h3>TEAM PROFILE PICTURE</h3>
        <div className="photo-upload-section">
          <div className="photo-preview-container">
            <img 
              src={photoPreview || '/default-team.svg'} 
              alt={team.name}
              className="photo-preview"
              onError={(e) => {
                e.target.src = '/default-team.svg';
              }}
            />
            {uploadingPhoto && (
              <div className="upload-overlay">
                <div className="upload-spinner">UPLOADING...</div>
              </div>
            )}
          </div>
          <div className="photo-upload-controls">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="upload-photo-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? 'UPLOADING...' : 'UPLOAD PHOTO'}
            </button>
            {teamPhotoURL && (
              <button
                type="button"
                className="remove-photo-btn"
                onClick={async () => {
                  setTeamPhotoURL('');
                  setPhotoPreview(null);
                  await updateDoc(doc(db, 'teams', team.id), { photoURL: null });
                }}
              >
                REMOVE
              </button>
            )}
          </div>
          <p className="form-hint">Recommended: Square image, max 5MB. Used as team icon in dropdowns.</p>
        </div>
      </div>

      <div className="settings-section">
        <h3>TEAM DETAILS</h3>
        <div className="form-group">
          <label>TEAM NAME</label>
          <input 
            type="text" 
            value={teamName} 
            onChange={(e) => setTeamName(e.target.value)}
            className="custom-input"
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>REGION</label>
            <CustomDropdown 
              options={regionOptions}
              value={region}
              onChange={setRegion}
            />
          </div>
          <div className="form-group">
            <label>AVERAGE RANK</label>
            <CustomDropdown
              options={OVERWATCH_RANK_OPTIONS}
              value={sr}
              onChange={setSr}
            />
          </div>
          <div className="form-group">
            <label>DIVISION</label>
            <CustomDropdown 
              options={divisionOptions}
              value={faceitDiv}
              onChange={setFaceitDiv}
            />
          </div>
        </div>
        <button className="save-btn" onClick={handleSave}>SAVE CHANGES</button>
      </div>

      <div className="settings-section">
        <h3>SR VERIFICATION</h3>
        <p className="section-desc">APPLY FOR TIER RATING VERIFICATION BASED ON TEAM SR.</p>
        <button className="apply-btn" disabled>APPLY (COMING SOON)</button>
      </div>
      
      {isManager && (
        <>
          <div className="settings-section">
            <h3>DISCORD BOT SETUP</h3>
            <p className="section-desc">
              To invite players and manage your team, you need to invite the Swiss Play Discord bot to your Discord server.
            </p>
            
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1.5rem', 
              background: 'rgba(114, 137, 218, 0.1)', 
              border: '1px solid rgba(114, 137, 218, 0.3)',
              borderRadius: '4px'
            }}>
              <h4 style={{ color: '#7289da', margin: '0 0 1rem 0', fontFamily: 'Share Tech Mono', fontSize: '1rem', textTransform: 'uppercase' }}>
                INVITE BOT TO YOUR DISCORD SERVER
              </h4>
              <p style={{ color: 'var(--color-text-secondary, rgba(255, 255, 255, 0.7))', margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
                Click the link below to authorize the Swiss Play bot in your Discord server. The bot needs access to send DMs and manage team invitations.
              </p>
              <a 
                href="https://discord.com/oauth2/authorize?client_id=1445440806797185129" 
                target="_blank"
                rel="noopener noreferrer"
                className="save-btn"
                style={{ 
                  display: 'inline-block',
                  textDecoration: 'none',
                  textAlign: 'center',
                  marginTop: '0.5rem'
                }}
              >
                INVITE BOT TO DISCORD SERVER
              </a>
              <p style={{ color: 'var(--color-text-secondary, rgba(255, 255, 255, 0.6))', margin: '1rem 0 0 0', fontSize: '0.85rem', fontStyle: 'italic' }}>
                You must be a server administrator or have "Manage Server" permissions to invite the bot.
              </p>
            </div>
          </div>

          <div className="settings-section">
            <h3>INVITE OPERATIVES</h3>
            <p className="section-desc">
              Invite players to join your team by Discord username. They will be added to the roster when they accept the confirmation DM. Make sure the Discord bot is invited to your server first.
            </p>
          <form onSubmit={handleInvite} className="invite-form">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <input 
                type="text" 
                value={inviteDiscordUsername} 
                onChange={(e) => setInviteDiscordUsername(e.target.value)}
                placeholder="ENTER DISCORD USERNAME"
                className="custom-input"
                disabled={isInviting}
              />
            </div>
            <button 
              type="submit" 
              className="invite-btn" 
              style={{ marginTop: 0 }}
              disabled={isInviting || !inviteDiscordUsername.trim()}
            >
              {isInviting ? 'SENDING INVITE...' : 'INVITE'}
            </button>
          </form>
          
          {pendingVerifications.filter(v => v.isInvite).length > 0 && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 0, 0.1)', borderRadius: '4px' }}>
              <h4 style={{ color: '#ffff00', margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>
                PENDING INVITES ({pendingVerifications.filter(v => v.isInvite).length})
              </h4>
              {pendingVerifications.filter(v => v.isInvite).map((verification) => (
                <div 
                  key={verification.id}
                  style={{ 
                    padding: '0.5rem', 
                    background: 'rgba(0,0,0,0.2)', 
                    borderRadius: '4px', 
                    marginBottom: '0.5rem',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ color: '#fff' }}>
                    <strong>{verification.discordUsername}</strong>
                  </div>
                  <div style={{ color: '#999', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {verification.dmSent ? '✅ DM Sent - Waiting for acceptance' : '⏳ Waiting for bot to send DM...'}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </>
      )}
      
      <div className="settings-section">
        <h3>DISCORD LINKED ACCOUNTS</h3>
        <p className="section-desc">Team members with linked Discord accounts:</p>
        <div style={{ marginTop: '1rem' }}>
          {team.members
            .filter(m => m.discordId || m.discordUsername)
            .map((member, index) => (
              <div 
                key={index} 
                style={{ 
                  padding: '0.75rem', 
                  background: 'rgba(114, 137, 218, 0.1)', 
                  borderRadius: '4px', 
                  marginBottom: '0.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ color: '#fff', fontWeight: 'bold' }}>{member.name}</div>
                  <div style={{ color: '#999', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    {member.discordUsername ? (
                      <>💬 Discord: <span style={{ color: '#7289da' }}>{member.discordUsername}</span></>
                    ) : member.discordId ? (
                      <>💬 Discord: <span style={{ color: '#ffaa00' }}>Username not available</span></>
                    ) : (
                      <>💬 Discord: Not linked</>
                    )}
                  </div>
                </div>
                <div style={{ color: '#00ff00', fontSize: '0.9rem' }}>✅</div>
              </div>
            ))}
          {team.members.filter(m => m.discordId || m.discordUsername).length === 0 && (
            <p style={{ color: '#999', fontSize: '0.9rem', fontStyle: 'italic' }}>
              No Discord accounts linked yet.
            </p>
          )}
        </div>
      </div>
      
      
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <h3 style={{ margin: 0 }}>LINK YOUR DISCORD ACCOUNT</h3>
          <button
            type="button"
            onClick={() => setShowDiscordHelpModal(true)}
            className="discord-help-btn"
            title="How to link Discord"
            aria-label="How to link Discord"
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '1px solid rgba(114, 137, 218, 0.5)',
              background: 'rgba(114, 137, 218, 0.15)',
              color: '#7289da',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              flexShrink: 0
            }}
          >
            ?
          </button>
        </div>
        <p className="section-desc">
          Link your own Discord account to enable bot commands and availability requests.
        </p>

        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(114, 137, 218, 0.08)', border: '1px solid rgba(114, 137, 218, 0.25)', borderRadius: '4px' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 'bold', color: '#7289da' }}>
            ✅ RECOMMENDED: Verify via Discord Bot
          </p>
          <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, rgba(255,255,255,0.8))' }}>
            Click the button below to receive a secure verification DM from the bot. This is required for manager features like adding players to your team.
          </p>
          <button
            className="save-btn"
            onClick={handleVerifyViaBot}
            disabled={isLinking || verificationStatus === 'pending' || verificationStatus === 'dm_sent'}
            style={{ marginTop: '0.5rem', width: 'auto' }}
          >
            {isLinking ? 'SENDING...' : verificationStatus === 'pending' || verificationStatus === 'dm_sent' ? 'CHECK YOUR DISCORD DMS' : 'VERIFY DISCORD (MANAGERS)'}
          </button>
        </div>
        
        {verificationStatus === 'linked' ? (
          <div style={{ padding: '1rem', background: 'rgba(0, 255, 0, 0.1)', borderRadius: '4px', marginTop: '1rem' }}>
            <p style={{ color: '#00ff00', margin: 0 }}>
              ✅ Your Discord account is linked!
            </p>
            <p style={{ color: '#999', fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>
              You can link another account or update your link by entering a new username below.
            </p>
          </div>
        ) : verificationStatus === 'pending' || verificationStatus === 'dm_sent' ? (
          <div style={{ padding: '1rem', background: 'rgba(255, 255, 0, 0.1)', borderRadius: '4px', marginTop: '1rem' }}>
            {verificationStatus === 'dm_sent' ? (
              <>
                <p style={{ color: '#00ff00', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                  ✅ Verification DM sent!
                </p>
                <p style={{ color: '#ccc', fontSize: '0.9rem', margin: 0, lineHeight: '1.6' }}>
                  Check your Discord DMs for a confirmation message from the bot. Click "✅ Confirm" to link your account.
                </p>
              </>
            ) : (
              <>
                <p style={{ color: '#ffff00', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                  ⏳ Searching for Discord user and sending DM...
                </p>
                <p style={{ color: '#ccc', fontSize: '0.9rem', margin: 0 }}>
                  Looking for user <strong>{discordUsername}</strong> in Discord servers...
                </p>
              </>
            )}
          </div>
        ) : verificationStatus === 'dm_failed' ? (
          <div style={{ padding: '1rem', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '4px', marginTop: '1rem' }}>
            <p style={{ color: '#ff0000', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
              ❌ Could not send DM automatically
            </p>
            <p style={{ color: '#ccc', fontSize: '0.9rem', margin: '0 0 0.5rem 0' }}>
              {dmError || 'Make sure you\'re in a server with the bot, or use the manual verification method.'}
            </p>
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
              <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
                Manual Verification:
              </p>
              <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.25rem 0' }}>
                1. Open Discord
              </p>
              <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0 0 0.25rem 0' }}>
                2. Run: <code style={{ background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '3px' }}>/verify-discord code:{verificationCode}</code>
              </p>
              <p style={{ color: '#ccc', fontSize: '0.85rem', margin: 0 }}>
                3. Check your DMs and confirm
              </p>
            </div>
          </div>
        ) : verificationStatus === 'confirmed' ? (
          <div style={{ padding: '1rem', background: 'rgba(0, 255, 0, 0.1)', borderRadius: '4px', marginTop: '1rem' }}>
            <p style={{ color: '#00ff00', margin: 0 }}>
              ✅ Discord account successfully linked! Page will refresh...
            </p>
          </div>
        ) : (
          <>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>DISCORD USERNAME</label>
              <input 
                type="text" 
                value={discordUsername} 
                onChange={(e) => setDiscordUsername(e.target.value)}
                placeholder="Enter your Discord username (e.g., username)"
                className="custom-input"
                disabled={isLinking}
              />
              <p style={{ color: '#999', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Enter your Discord username (without #). The bot will automatically find you and send a DM.
              </p>
            </div>
            <button 
              className="save-btn" 
              onClick={handleLinkDiscord}
              disabled={isLinking || !discordUsername.trim()}
              style={{ marginTop: '1rem' }}
            >
              {isLinking ? 'SENDING VERIFICATION...' : 'LINK DISCORD ACCOUNT'}
            </button>
          </>
        )}
        
        {verificationStatus === 'denied' && (
          <div style={{ padding: '1rem', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '4px', marginTop: '1rem' }}>
            <p style={{ color: '#ff0000', margin: 0 }}>
              ❌ Verification was denied. Please try again.
            </p>
            <button 
              className="save-btn" 
              onClick={handleLinkDiscord}
              disabled={isLinking}
              style={{ marginTop: '1rem' }}
            >
              {isLinking ? 'CREATING VERIFICATION...' : 'TRY AGAIN'}
            </button>
          </div>
        )}
        
        {verificationStatus === 'expired' && (
          <div style={{ padding: '1rem', background: 'rgba(255, 165, 0, 0.1)', borderRadius: '4px', marginTop: '1rem' }}>
            <p style={{ color: '#ffaa00', margin: 0 }}>
              ⏰ Verification code expired. Please create a new one.
            </p>
            <button 
              className="save-btn" 
              onClick={handleLinkDiscord}
              disabled={isLinking}
              style={{ marginTop: '1rem' }}
            >
              {isLinking ? 'CREATING VERIFICATION...' : 'GENERATE NEW CODE'}
            </button>
          </div>
        )}
      </div>

      {/* Closable Discord linking instructions popup */}
      <Modal
        isOpen={showDiscordHelpModal}
        onClose={() => setShowDiscordHelpModal(false)}
        title="How to Link Your Discord"
        type="info"
      >
        <DiscordLinkingInstructions verificationCode={discordHelpCodeRef.current || verificationCode || undefined} />
      </Modal>

      {showCropper && imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          onCropComplete={handleCropComplete}
          onCancel={handleCancelCrop}
        />
      )}
    </div>
  );
};

export default SettingsTab;
