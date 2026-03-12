import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import Modal from './UI/Modal';
import DiscordLinkingInstructions from './DiscordLinkingInstructions';
import { useToast } from '../context/ToastContext';
import './DiscordLinkingSection.css';

/**
 * Reusable Discord linking section for Profile and Edit Profile.
 * Shows linked status or the link flow (username input + verify).
 */
const DiscordLinkingSection = ({ user, showHeading = true }) => {
  const toast = useToast();
  const [discordUsername, setDiscordUsername] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkedDiscordId, setLinkedDiscordId] = useState(null);
  const [discordHelpModalCode, setDiscordHelpModalCode] = useState(null); // null = closed, string = open with this code

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.discordId) {
            setLinkedDiscordId(data.discordId);
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };
    if (user) {
      loadUserData();
    }
  }, [user]);

  const handleLinkDiscord = async () => {
    if (!discordUsername.trim()) {
      toast.error('Please enter your Discord username');
      return;
    }

    setIsLinking(true);
    try {
      const code = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const cleanUsername = discordUsername.split('#')[0].trim();

      await setDoc(doc(db, 'discordVerifications', code), {
        discordUsername: cleanUsername,
        userUid: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0],
        status: 'pending',
        createdAt: new Date(),
        dmSent: false
      });

      setDiscordHelpModalCode(code);
      setDiscordUsername('');
    } catch (error) {
      console.error('Error creating verification:', error);
      toast.error('Failed to create verification. Please try again.');
    } finally {
      setIsLinking(false);
    }
  };

  const openHelpModal = () => setDiscordHelpModalCode('help');

  if (linkedDiscordId) {
    return (
      <div className="discord-linked-section">
        <p className="discord-linked-status">✅ Discord account linked</p>
        <p className="discord-linked-hint">Your Discord account is connected to your profile.</p>
      </div>
    );
  }

  return (
    <div className="discord-linking-section">
      <div className="discord-linking-header">
        {showHeading && <h3 className="discord-linking-title">DISCORD ACCOUNT</h3>}
        <button
          type="button"
          onClick={openHelpModal}
          title="How to link Discord"
          aria-label="How to link Discord"
          className="discord-help-btn"
        >
          ?
        </button>
      </div>
      <p className="discord-linking-desc">Link your Discord account to enable team features and bot commands.</p>
      <div className="form-group">
        <input
          type="text"
          value={discordUsername}
          onChange={(e) => setDiscordUsername(e.target.value)}
          placeholder="Enter your Discord username"
          className="custom-input"
          disabled={isLinking}
        />
        <p className="form-hint">Enter your Discord username (without #). You'll receive a verification DM.</p>
      </div>
      <button
        type="button"
        className="save-btn"
        onClick={handleLinkDiscord}
        disabled={isLinking || !discordUsername.trim()}
      >
        {isLinking ? 'LINKING...' : 'LINK DISCORD ACCOUNT'}
      </button>

      <Modal
        isOpen={discordHelpModalCode !== null}
        onClose={() => setDiscordHelpModalCode(null)}
        title="How to Link Your Discord"
        type="info"
      >
        <DiscordLinkingInstructions verificationCode={discordHelpModalCode === 'help' ? undefined : discordHelpModalCode} />
      </Modal>
    </div>
  );
};

export default DiscordLinkingSection;
