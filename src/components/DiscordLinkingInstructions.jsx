import React from 'react';

/**
 * Reusable Discord linking instructions for help modals.
 * Used in EditProfile and SettingsTab.
 */
export const DiscordLinkingInstructions = ({ verificationCode = null }) => {
  const copyCode = () => {
    if (verificationCode) {
      navigator.clipboard?.writeText(`/verify-discord code:${verificationCode}`);
    }
  };

  return (
    <div className="discord-linking-instructions" style={{ lineHeight: 1.7 }}>
      {/* Show code prominently at top when we have it */}
      {verificationCode && (
        <div style={{ 
          marginBottom: '1.25rem', 
          padding: '1rem', 
          background: 'rgba(114, 137, 218, 0.15)', 
          border: '1px solid rgba(114, 137, 218, 0.4)',
          borderRadius: '6px',
          fontFamily: "'Share Tech Mono', monospace"
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', fontSize: '0.85rem', color: '#7289da' }}>
            YOUR VERIFICATION CODE (save this):
          </p>
          <code style={{ 
            display: 'block', 
            fontSize: '1rem',
            color: '#fff',
            letterSpacing: '1px',
            userSelect: 'all'
          }}>
            {verificationCode}
          </code>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            In Discord, run: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '3px' }}>/verify-discord code:{verificationCode}</code>
          </p>
          <button
            type="button"
            onClick={copyCode}
            style={{
              marginTop: '0.5rem',
              padding: '4px 10px',
              fontSize: '0.8rem',
              background: 'rgba(114, 137, 218, 0.3)',
              border: '1px solid rgba(114, 137, 218, 0.5)',
              borderRadius: '4px',
              color: '#7289da',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Copy command
          </button>
        </div>
      )}

      <p style={{ margin: '0 0 1rem 0' }}>
        <strong>1.</strong> Check your Discord DMs for a message from the SwissPlay bot.
      </p>
      <p style={{ margin: '0 0 1rem 0' }}>
        <strong>2.</strong> Click &quot;✅ Confirm&quot; in the DM to link your account.
      </p>
      <p style={{ margin: '0 0 1rem 0', color: 'var(--color-text-secondary)' }}>
        <strong>No DM received?</strong> Run <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '3px' }}>/help</code> in your Discord server first (to register it), then try linking again. Also:
      </p>
      <ul style={{ margin: '0 0 1rem 0', paddingLeft: '1.25rem' }}>
        <li>You must be in a server that has the SwissPlay bot</li>
        <li>Allow DMs from server members (Discord Settings → Privacy)</li>
        <li>Your username must match exactly</li>
      </ul>
      {verificationCode && (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          Or use the manual code above—run <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '3px' }}>/verify-discord code:{verificationCode}</code> in any Discord channel (in a server with the bot).
        </p>
      )}
    </div>
  );
};

export default DiscordLinkingInstructions;
