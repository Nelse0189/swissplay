import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase/config';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import Modal from '../components/UI/Modal';
import ImageCropper from '../components/UI/ImageCropper';
import { useToast } from '../context/ToastContext';
import LoadingState from '../components/UI/LoadingState';
import CustomDropdown from '../components/UI/CustomDropdown';
import { OW_RANK_OPTIONS_FOR_DROPDOWN, getRankValueForSr, getSrForRankValue } from '../utils/overwatchRanks';
import './EditProfile.css';

const EditProfile = () => {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    displayName: '',
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
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setFormData({
              displayName: data.displayName || currentUser.displayName || '',
              skillRating: getRankValueForSr(data.skillRating),
              bio: data.bio || '',
              photoURL: data.photoURL || currentUser.photoURL || ''
            });
            setPhotoPreview(data.photoURL || currentUser.photoURL || null);
          } else {
            setFormData({
              displayName: currentUser.displayName || currentUser.email?.split('@')[0] || '',
              skillRating: '',
              bio: '',
              photoURL: currentUser.photoURL || ''
            });
            setPhotoPreview(currentUser.photoURL || null);
          }
        } catch (error) {
          console.error('Error loading profile:', error);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;

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
      
      const updateData = {
        displayName: formData.displayName,
        photoURL: formData.photoURL || null,
        skillRating: getSrForRankValue(formData.skillRating),
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
          createdAt: new Date()
        });
      }

      setModal({ isOpen: true, title: 'Success', message: 'Profile updated successfully!', type: 'success' });
      setTimeout(() => {
        navigate('/profile');
      }, 1500);
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
              <h3>DISCORD ACCOUNT</h3>
              <p className="section-desc">Link your Discord account to enable team features and bot commands.</p>
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

// Discord Linking Component (simplified version for EditProfile)
const DiscordLinkingSection = ({ user }) => {
  const toast = useToast();
  const [discordUsername, setDiscordUsername] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkedDiscordId, setLinkedDiscordId] = useState(null);

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
      // Create verification document
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
      
      toast.success(`Verification code created. Check your Discord DMs or run /verify-discord code:${code} in Discord.`);
      setDiscordUsername('');
    } catch (error) {
      console.error('Error creating verification:', error);
      toast.error('Failed to create verification. Please try again.');
    } finally {
      setIsLinking(false);
    }
  };

  if (linkedDiscordId) {
    return (
      <div className="discord-linked">
        <p style={{ color: '#4caf50', margin: 0 }}>✅ Discord account linked</p>
        <p className="form-hint">Your Discord account is connected to your profile.</p>
      </div>
    );
  }

  return (
    <div className="discord-linking">
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
    </div>
  );
};

export default EditProfile;

