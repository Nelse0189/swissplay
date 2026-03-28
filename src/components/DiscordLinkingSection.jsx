import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../context/ToastContext';
import './DiscordLinkingSection.css';

const SWISSPLAY_DISCORD = 'https://discord.gg/rFUX24TeXc';

/**
 * Reusable Discord linking section for Profile and Edit Profile.
 * Shows linked status or the link flow (username input + verify).
 */
const DiscordLinkingSection = ({ user, showHeading = true }) => {
  const toast = useToast();
  const [discordUsername, setDiscordUsername] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkedDiscordId, setLinkedDiscordId] = useState(null);
  const [pendingVerificationCode, setPendingVerificationCode] = useState(null);

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

      setPendingVerificationCode(code);
      setDiscordUsername('');
    } catch (error) {
      console.error('Error creating verification:', error);
      toast.error('Failed to create verification. Please try again.');
    } finally {
      setIsLinking(false);
    }
  };

  const copyPendingVerifyCommand = async () => {
    if (!pendingVerificationCode) return;
    const text = `/verify-discord code:${pendingVerificationCode}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Command copied to clipboard');
    } catch {
      toast.error('Could not copy automatically — select the command text instead');
    }
  };

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
      </div>
      <p className="discord-linking-desc">Link your Discord account to enable team features and bot commands.</p>
      <p className="discord-linking-instructions">
        <a href={SWISSPLAY_DISCORD} target="_blank" rel="noopener noreferrer" className="discord-link">
          Join the Swissplay Discord
        </a>{' '}
        first, then enter your Discord username below. The bot will send you a DM to confirm.
      </p>
      {pendingVerificationCode && (
        <div className="discord-verification-pending">
          <p>Check your Discord DMs for a verification message. If you didn&apos;t receive one, run{' '}
            <code>/verify-discord code:{pendingVerificationCode}</code> in the Swissplay Discord.
          </p>
          <button
            type="button"
            className="discord-verification-copy-btn"
            onClick={copyPendingVerifyCommand}
          >
            Copy command
          </button>
        </div>
      )}
      <div className="form-group">
        <input
          type="text"
          value={discordUsername}
          onChange={(e) => setDiscordUsername(e.target.value)}
          placeholder="Enter your Discord username"
          className="custom-input"
          disabled={isLinking}
        />
        <p className="form-hint">Enter your Discord username (without #).</p>
      </div>
      <button
        type="button"
        className="save-btn"
        onClick={handleLinkDiscord}
        disabled={isLinking || !discordUsername.trim()}
      >
        {isLinking ? 'LINKING...' : 'LINK DISCORD ACCOUNT'}
      </button>
    </div>
  );
};

export default DiscordLinkingSection;
