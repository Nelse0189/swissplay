import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { markAsRead, markAllAsRead } from '../../utils/notifications';
import './InboxDropdown.css';

const InboxDropdown = ({ user }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notif) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);

    // Navigate based on type
    if (notif.type === 'scrim_request' || notif.type === 'scrim_response') {
      navigate('/scrims');
    } else if (notif.type === 'availability_change' || notif.type === 'lft_invite_accepted') {
      navigate('/teams/overwatch');
    } else if (notif.type === 'review') {
      navigate('/scrims'); // Or a specific team page
    } else if (notif.type === 'profile_update') {
      navigate('/teams/overwatch');
    }
  };

  const handleAcceptInvite = async (e, notif) => {
    e.stopPropagation();
    try {
      const teamRef = doc(db, 'teams', notif.actionData.teamId);
      
      const { getDoc } = await import('firebase/firestore');
      const teamDoc = await getDoc(teamRef);
      if (!teamDoc.exists()) {
        alert('Team no longer exists.');
        return;
      }

      const teamData = teamDoc.data();
      const existingMember = teamData.members?.find(m => m.uid === user.uid);
      
      if (!existingMember) {
        const newMember = {
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'Player',
          roles: ['Player'],
          availability: []
        };
  
        const updatedMembers = [...(teamData.members || []), newMember];
        const updatedMemberUids = [...(teamData.memberUids || []), user.uid];

        await updateDoc(teamRef, {
          members: updatedMembers,
          memberUids: updatedMemberUids
        });
      }

      // Mark as read
      await markAsRead(notif.id);

      // We could also send a notification back to the manager
      const { createNotification } = await import('../../utils/notifications');
      await createNotification(notif.actionData.managerId, {
        type: 'lft_invite_accepted',
        title: 'Invite Accepted!',
        message: `${user.displayName || user.email?.split('@')[0] || 'Player'} has accepted your invite to ${notif.actionData.teamName}.`,
        actionData: { teamId: notif.actionData.teamId }
      });

      navigate('/teams/overwatch');
      setIsOpen(false);
    } catch (error) {
      console.error('Error accepting invite:', error);
      alert('Failed to accept invite. Please try again.');
    }
  };

  const handleDeclineInvite = async (e, notif) => {
    e.stopPropagation();
    try {
      await markAsRead(notif.id);
      
      // Optionally notify manager
      const { createNotification } = await import('../../utils/notifications');
      await createNotification(notif.actionData.managerId, {
        type: 'lft_invite_declined',
        title: 'Invite Declined',
        message: `${user.displayName || 'A player'} declined your invite to ${notif.actionData.teamName}.`,
        actionData: { teamId: notif.actionData.teamId }
      });
    } catch (error) {
      console.error('Error declining invite:', error);
    }
  };

  return (
    <div className="inbox-container" ref={dropdownRef}>
      <button 
        className="inbox-bell-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bell-icon">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unreadCount > 0 && (
          <span className="unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="inbox-dropdown">
          <div className="inbox-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button 
                className="mark-all-read-btn"
                onClick={() => markAllAsRead(user.uid)}
              >
                Mark all as read
              </button>
            )}
          </div>
          
          <div className="inbox-list">
            {notifications.length === 0 ? (
              <div className="empty-inbox">No notifications</div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className={`notification-item ${!notif.read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="notif-content">
                    <h4 className="notif-title">{notif.title}</h4>
                    <p className="notif-message">{notif.message}</p>
                    <span className="notif-time">
                      {notif.createdAt?.toDate ? new Date(notif.createdAt.toDate()).toLocaleString() : 'Just now'}
                    </span>
                  </div>
                  
                  {notif.type === 'lft_invite' && !notif.read && (
                    <div className="notif-actions">
                      <button 
                        className="notif-action-btn accept"
                        onClick={(e) => handleAcceptInvite(e, notif)}
                      >
                        Accept
                      </button>
                      <button 
                        className="notif-action-btn decline"
                        onClick={(e) => handleDeclineInvite(e, notif)}
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InboxDropdown;
