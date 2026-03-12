import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase/config';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import Modal from '../components/UI/Modal';
import ImageCropper from '../components/UI/ImageCropper';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/UI/LoadingState';
import DiscordLinkingSection from '../components/DiscordLinkingSection';
import CustomDropdown from '../components/UI/CustomDropdown';
import { OW_RANK_OPTIONS_FOR_DROPDOWN, getRankValueForSr, getSrForRankValue } from '../utils/overwatchRanks';
import { createNotification } from '../utils/notifications';
import './EditProfile.css';

function toUsername(displayName, uid = '') {
  const sanitized = (displayName || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
  if (sanitized.length >= 3) return sanitized;
  const pad = (uid || '').replace(/[^a-z0-9]/g, '').toLowerCase().slice(-3);
  return (sanitized + pad).slice(0, 30) || 'player';
}

const EditProfile = () => {
  const { user, userData, refreshUserProfile } = useAuth();
  const [formData, setFormData] = useState({
    displayName: '',
    username: '',
    skillRating: '',
    bio: '',
    photoURL: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const fileInputRef = useRef(null);
  const initialFormDataRef = useRef(null);
  const allowNavigationRef = useRef(false);
  const navigate = useNavigate();

  // Note: useBlocker requires createBrowserRouter (data router), not BrowserRouter.
  // Unsaved-changes in-app blocking is disabled to avoid crashes.

  const isDirty = initialFormDataRef.current && (
    formData.displayName !== initialFormDataRef.current.displayName ||
    formData.username !== initialFormDataRef.current.username ||
    formData.skillRating !== initialFormDataRef.current.skillRating ||
    formData.bio !== initialFormDataRef.current.bio ||
    (formData.photoURL || '') !== (initialFormDataRef.current.photoURL || '')
  );

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const loadFormData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const displayName = data.displayName || user.displayName || '';
          const username = data.username || toUsername(displayName, user.uid);
          const newFormData = {
            displayName,
            username,
            skillRating: getRankValueForSr(data.skillRating),
            bio: data.bio || '',
            photoURL: data.photoURL || user.photoURL || ''
          };
          setFormData(newFormData);
          initialFormDataRef.current = { ...newFormData };
          setPhotoPreview(data.photoURL || user.photoURL || null);
        } else {
          const displayName = user.displayName || user.email?.split('@')[0] || '';
          const username = toUsername(displayName, user.uid);
          const newFormData = {
            displayName,
            username,
            skillRating: '',
            bio: '',
            photoURL: user.photoURL || ''
          };
          setFormData(newFormData);
          initialFormDataRef.current = { ...newFormData };
          setPhotoPreview(user.photoURL || null);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };
    loadFormData();
  }, [user]);

  // Auto-sync username when display name changes (if username is empty)
  useEffect(() => {
    if (!user || loading) return;
    if (!formData.username && formData.displayName) {
      const derived = toUsername(formData.displayName, user.uid);
      if (derived && derived !== formData.username) {
        setFormData(prev => ({ ...prev, username: derived }));
      }
    }
  }, [formData.displayName, formData.username, user, loading]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setModal({ isOpen: true, title: 'Invalid File', message: 'Please select an image file.', type: 'error' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setModal({ isOpen: true, title: 'File Too Large', message: 'Image must be less than 5MB.', type: 'error' });
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
      const fileName = `profile_${Date.now()}${fileExtension}`;
      const storageRef = ref(storage, `profile-pictures/${user.uid}/${fileName}`);
      await uploadBytes(storageRef, croppedBlob);
      const downloadURL = await getDownloadURL(storageRef);

      // Update form data and preview
      setFormData({ ...formData, photoURL: downloadURL });
      setPhotoPreview(downloadURL);
    } catch (error) {
      console.error('Error uploading photo:', error);
      setModal({ isOpen: true, title: 'Upload Failed', message: 'Failed to upload photo. Please try again.', type: 'error' });
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

  const isValidUsername = (v) => /^[a-z0-9_]{3,30}$/.test(v);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;

    const trimmedUsername = (formData.username?.trim().toLowerCase() || toUsername(formData.displayName, user.uid)) || '';
    if (!trimmedUsername) {
      setModal({ isOpen: true, title: 'Username Required', message: 'A unique username is required for your profile URL (e.g. swissplay.gg/profile/johndoe).', type: 'error' });
      return;
    }
    if (!isValidUsername(trimmedUsername)) {
      setModal({ isOpen: true, title: 'Invalid Username', message: 'Username must be 3-30 characters, lowercase letters, numbers, and underscores only (e.g. johndoe).', type: 'error' });
      return;
    }
    const existingQuery = query(collection(db, 'users'), where('username', '==', trimmedUsername));
    const existingSnap = await getDocs(existingQuery);
    const takenByOther = existingSnap.docs.some(d => d.id !== user.uid);
    if (takenByOther) {
      setModal({ isOpen: true, title: 'Username Taken', message: 'That username is already in use. Please choose another.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      // Update Firebase Auth display name and photo
      const authUpdates = {};
      if (formData.displayName !== user.displayName) {
        authUpdates.displayName = formData.displayName;
      }
      if (formData.photoURL && formData.photoURL !== user.photoURL) {
        authUpdates.photoURL = formData.photoURL;
      }
      if (Object.keys(authUpdates).length > 0) {
        await updateProfile(user, authUpdates);
      }

      // Update Firestore user document
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      const newSr = getSrForRankValue(formData.skillRating);
      const srChanged = userDoc.exists() && userDoc.data().skillRating !== newSr;

      const updateData = {
        displayName: formData.displayName,
        username: trimmedUsername || null,
        photoURL: formData.photoURL || null,
        skillRating: newSr,
        bio: formData.bio,
        updatedAt: new Date()
      };

      if (userDoc.exists()) {
        await updateDoc(userRef, updateData);
      } else {
        await setDoc(userRef, {
          ...updateData,
          email: user.email,
          uid: user.uid,
          isModerator: false,
          createdAt: new Date()
        });
      }

      if (srChanged) {
        // Find user's teams and notify managers
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        teamsSnapshot.docs.forEach(teamDoc => {
          const team = teamDoc.data();
          if (team.members && team.members.some(m => m.uid === user.uid)) {
            team.members.forEach(m => {
              if ((m.roles?.includes('Manager') || m.roles?.includes('Owner')) && m.uid !== user.uid) {
                createNotification(m.uid, {
                  type: 'profile_update',
                  title: 'Player Profile Updated',
                  message: `${formData.displayName} has updated their SR to ${formData.skillRating}.`,
                  actionData: { teamId: teamDoc.id, userId: user.uid }
                });
              }
            });
          }
        });
      }

      await refreshUserProfile();
      const newProfilePath = trimmedUsername ? `/profile/${trimmedUsername}` : '/profile';
      setModal({ isOpen: true, title: 'Success', message: 'Profile updated successfully!', type: 'success' });
      // Use window.location to force URL update (navigate() can be unreliable with form submits)
      window.location.replace(newProfilePath);
    } catch (error) {
      console.error('Error updating profile:', error);
      setModal({ isOpen: true, title: 'Error', message: 'Failed to update profile. Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const showModal = (title, message, type = 'info') => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' });
  };


  if (loading) {
    return (
      <div className="edit-profile-page">
        <div className="content-wrapper">
          <div className="edit-profile-content">
            <LoadingState message="Loading..." />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="edit-profile-page">
        <div className="content-wrapper">
          <div className="edit-profile-content">
            <div className="auth-prompt-container">
              <h2>AUTHENTICATION REQUIRED</h2>
              <p>PLEASE SIGN IN TO EDIT YOUR PROFILE.</p>
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
    <div className="edit-profile-page">
      <div className="content-wrapper">
        <div className="edit-profile-content">
          <div className="edit-profile-header">
            <h1>EDIT PROFILE</h1>
            <button className="save-btn" onClick={() => navigate('/profile')}>
              BACK TO PROFILE
            </button>
          </div>

          <form onSubmit={handleSave} className="profile-form">
            <div className="form-section">
              <h3>PROFILE PICTURE</h3>
              <div className="photo-upload-section">
                <div className="photo-preview-container">
                  <img 
                    src={photoPreview || '/default-avatar.png'} 
                    alt="Profile" 
                    className="photo-preview"
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjYwIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiLz4KPHBhdGggZD0iTTYwIDM2QzQ4LjA0NDMgMzYgMzggNDYuMDQ0MyAzOCA1OEMzOCA2OS45NTU3IDQ4LjA0NDMgODAgNjAgODBDNzEuOTU1NyA4MCA4MiA2OS45NTU3IDgyIDU4QzgyIDQ2LjA0NDMgNzEuOTU1NyAzNiA2MCAzNlpNNjAgODRDMzkuNDg0NSA4NCAyNCA5NS4zNzI3IDI0IDEwOEg5NkM5NiA5NS4zNzI3IDgwLjUxNTUgODQgNjAgODRaIiBmaWxsPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNSkiLz4KPC9zdmc+';
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
                  {formData.photoURL && (
                    <button
                      type="button"
                      className="remove-photo-btn"
                      onClick={() => {
                        setFormData({ ...formData, photoURL: '' });
                        setPhotoPreview(null);
                      }}
                    >
                      REMOVE
                    </button>
                  )}
                </div>
                <p className="form-hint">Recommended: Square image, max 5MB</p>
              </div>
            </div>

            <div className="form-section">
              <h3>BASIC INFORMATION</h3>
              
              <div className="form-group">
                <label>DISPLAY NAME</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="custom-input"
                  placeholder="Enter your display name"
                  required
                />
              </div>

              <div className="form-group">
                <label>PROFILE URL</label>
                <div className="username-input-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="url-prefix" style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>swissplay.gg/profile/</span>
                  <input
                    type="text"
                    value={formData.username || toUsername(formData.displayName, user?.uid)}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    className="custom-input"
                    placeholder={toUsername(formData.displayName, user?.uid)}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
                <p className="form-hint">Auto-generated from your display name. You can customize it if needed.</p>
              </div>

              <div className="form-group">
                <label>EMAIL</label>
                <input
                  type="email"
                  value={user.email}
                  className="custom-input"
                  disabled
                />
                <p className="form-hint">Email cannot be changed</p>
              </div>
            </div>

            <div className="form-section">
              <h3>GAMING INFORMATION</h3>
              
              <div className="form-group">
                <label>SKILL RATING</label>
                <CustomDropdown
                  options={OW_RANK_OPTIONS_FOR_DROPDOWN.map((r) => ({ value: r.value, label: r.label }))}
                  value={formData.skillRating}
                  onChange={(v) => setFormData({ ...formData, skillRating: v })}
                  placeholder="Select your Overwatch rank"
                />
                <p className="form-hint">Your current competitive rank (Bronze through Champion)</p>
              </div>
            </div>

            <div className="form-section">
              <h3>BIOGRAPHY</h3>
              
              <div className="form-group">
                <label>BIO</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="custom-input"
                  placeholder="Tell us about yourself..."
                  rows="5"
                />
              </div>
            </div>

            <div className="form-section">
              <DiscordLinkingSection user={user} />
            </div>

            <div className="form-actions">
              <button type="button" className="save-btn secondary" onClick={() => navigate('/profile')}>
                CANCEL
              </button>
              <button type="submit" className="save-btn" disabled={saving || uploadingPhoto}>
                {saving ? 'SAVING...' : 'SAVE CHANGES'}
              </button>
            </div>
          </form>

          <Modal
            isOpen={modal.isOpen}
            onClose={closeModal}
            title={modal.title}
            message={modal.message}
            type={modal.type}
          />

          {showCropper && imageToCrop && (
            <ImageCropper
              image={imageToCrop}
              onCropComplete={handleCropComplete}
              onCancel={handleCancelCrop}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default EditProfile;

