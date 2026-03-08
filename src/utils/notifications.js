import { collection, addDoc, updateDoc, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Creates a notification for a user.
 * 
 * @param {string} userId - The UID of the user receiving the notification
 * @param {Object} data - The notification data
 * @param {string} data.type - The type of notification (scrim_request, availability_change, lft_invite, review, profile_update)
 * @param {string} data.title - The title of the notification
 * @param {string} data.message - The notification message
 * @param {Object} [data.actionData] - Optional JSON data for actions (e.g. teamId)
 */
export const createNotification = async (userId, data) => {
  if (!userId) return null;
  
  try {
    const notificationsRef = collection(db, 'notifications');
    const docRef = await addDoc(notificationsRef, {
      userId,
      ...data,
      read: false,
      createdAt: new Date()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

/**
 * Marks a single notification as read.
 * 
 * @param {string} notificationId - The ID of the notification to mark as read
 */
export const markAsRead = async (notificationId) => {
  if (!notificationId) return;
  
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, { read: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

/**
 * Marks all unread notifications for a user as read.
 * 
 * @param {string} userId - The UID of the user
 */
export const markAllAsRead = async (userId) => {
  if (!userId) return;
  
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef, 
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    
    const batch = writeBatch(db);
    snapshot.docs.forEach((document) => {
      batch.update(document.ref, { read: true });
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
  }
};
