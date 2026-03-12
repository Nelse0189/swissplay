import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (currentUser) => {
    if (!currentUser) {
      setUserData(null);
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData({
          ...data,
          photoURL: data.photoURL || currentUser.photoURL || null
        });
      } else {
        setUserData({
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          photoURL: currentUser.photoURL || null
        });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      setUserData(null);
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setUser(null);
      setUserData(null);
      return;
    }
    setUser(currentUser);
    await loadUserData(currentUser);
  }, [loadUserData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadUserData(currentUser);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loadUserData]);

  const value = {
    user,
    userData,
    loading,
    refreshUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
