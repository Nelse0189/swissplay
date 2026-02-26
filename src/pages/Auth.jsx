import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import './Auth.css';

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check Firebase auth on mount and test connection
  useEffect(() => {
    console.log('Auth component mounted');
    console.log('Auth object:', auth);
    
    if (!auth) {
      setError('Firebase Auth is not initialized. Please check the console for errors.');
      return;
    }
    
    // Test Firebase Auth API connection
    const testConnection = async () => {
      try {
        // Test if we can reach Firebase Auth API
        const testUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${auth.config.apiKey}`;
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@test.com',
            password: 'test123456',
            returnSecureToken: true
          })
        });
        
        const data = await response.json();
        console.log('Firebase Auth API test response:', data);
        
        if (data.error) {
          if (data.error.message.includes('EMAIL_EXISTS') || data.error.message.includes('WEAK_PASSWORD')) {
            console.log('✅ Firebase Auth API is reachable (expected test error)');
          } else if (data.error.message.includes('API_KEY_NOT_VALID')) {
            console.error('❌ Firebase API key is invalid');
            setError('Firebase API key is invalid. Please check Firebase configuration.');
          } else if (data.error.message.includes('OPERATION_NOT_ALLOWED')) {
            console.error('❌ Email/Password authentication is not enabled');
            setError('Email/Password authentication is not enabled in Firebase Console. Please enable it in Authentication → Sign-in method.');
          } else {
            console.log('✅ Firebase Auth API is reachable');
          }
        }
      } catch (fetchError) {
        console.error('❌ Cannot reach Firebase Auth API:', fetchError);
        setError('Cannot connect to Firebase Authentication. Please check:\n1. Your internet connection\n2. Firebase Authentication is enabled\n3. No firewall/proxy is blocking Firebase requests');
      }
    };
    
    testConnection();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!auth) {
      setError('Firebase Auth is not available. Please refresh the page.');
      setIsLoading(false);
      return;
    }

    // Wait for auth to be initialized
    try {
      // Wait for auth initialization with timeout
      const initTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth initialization timeout')), 5000)
      );
      
      const waitForAuth = new Promise((resolve) => {
        const checkAuth = () => {
          if (auth._isInitialized) {
            resolve();
          } else {
            setTimeout(checkAuth, 100);
          }
        };
        checkAuth();
      });
      
      await Promise.race([waitForAuth, initTimeout]);
      console.log('✅ Auth initialized, proceeding with', isSignUp ? 'sign up' : 'sign in');
    } catch (initError) {
      console.error('Auth initialization error:', initError);
      setError('Firebase Auth is taking too long to initialize. Please refresh the page.');
      setIsLoading(false);
      return;
    }

    try {
      console.log('Attempting to', isSignUp ? 'sign up' : 'sign in', 'with email:', email);
      
      // Add timeout to auth request
      const authPromise = isSignUp 
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout - please check your internet connection')), 30000)
      );
      
      await Promise.race([authPromise, timeoutPromise]);
      console.log('✅', isSignUp ? 'Sign up' : 'Sign in', 'successful');
      // Navigate to homepage after successful authentication
      navigate('/');
    } catch (err) {
      console.error('Auth error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      console.error('Full error:', err);
      
      // Provide more helpful error messages
      let errorMessage = err.message;
      if (err.message === 'Request timeout - please check your internet connection') {
        errorMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check:\n1. Your internet connection\n2. Firebase Authentication is enabled in Firebase Console\n3. Authorized domains include "localhost"';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="content-wrapper">
        <div className="auth-content">
          <h1>{isSignUp ? 'Sign Up' : 'Sign In'}</h1>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>
          </form>
          <p className="toggle-auth">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={() => setIsSignUp(!isSignUp)} className="toggle-btn">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;


