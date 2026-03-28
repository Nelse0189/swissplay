import React, { useState } from 'react';
import Modal from './Modal';
import CustomDropdown from './CustomDropdown';
import { createNotification } from '../../utils/notifications';

const LftInviteModal = ({ isOpen, onClose, agent, managerTeams, currentUser }) => {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen || !agent) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTeamId) {
      setError('Please select a team.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const selectedTeam = managerTeams.find(t => t.id === selectedTeamId);
      
      await createNotification(agent.uid, {
        type: 'lft_invite',
        title: 'Team Invitation',
        message: `${selectedTeam.name} has invited you to join their team!`,
        actionData: { 
          teamId: selectedTeam.id, 
          teamName: selectedTeam.name,
          managerId: currentUser.uid,
          managerName: currentUser.displayName || currentUser.email?.split('@')[0] || 'A manager'
        }
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        setSelectedTeamId('');
      }, 2000);
    } catch (err) {
      console.error('Error sending invite:', err);
      setError('Failed to send invite. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    setSuccess(false);
    setSelectedTeamId('');
    onClose();
  };

  const teamOptions = managerTeams.filter(t => !t.deprecated).map(t => ({ value: t.id, label: t.name }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Invite ${agent.displayName || 'Player'} to Team`}
      message=""
      type="info"
    >
      {success ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3>Invite Sent!</h3>
          <p>They will receive a notification in their inbox.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ padding: '1rem 0' }}>
          <div className="form-group">
            <label>SELECT TEAM</label>
            <CustomDropdown
              options={[{ value: '', label: '-- Select Team --' }, ...teamOptions]}
              value={selectedTeamId}
              onChange={setSelectedTeamId}
            />
          </div>
          
          {error && <div style={{ color: 'var(--color-danger)', marginTop: '1rem', fontSize: '0.9rem' }}>{error}</div>}
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button 
              type="button" 
              onClick={handleClose}
              style={{ flex: 1, padding: '0.8rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
            >
              CANCEL
            </button>
            <button 
              type="submit" 
              disabled={submitting || !selectedTeamId}
              style={{ flex: 1, padding: '0.8rem', background: 'var(--color-primary)', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {submitting ? 'SENDING...' : 'SEND INVITE'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default LftInviteModal;
