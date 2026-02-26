import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '../context/ToastContext';
import LoadingState from '../components/UI/LoadingState';
import './Revaluation.css';

const Revaluation = () => {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    reason: '',
    currentSR: '',
    expectedSR: '',
    additionalInfo: ''
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check for existing pending request
        try {
          const requestsRef = collection(db, 'revaluationRequests');
          const q = query(
            requestsRef,
            where('userId', '==', currentUser.uid),
            where('status', '==', 'pending')
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setExistingRequest(snapshot.docs[0].data());
          }
        } catch (error) {
          console.error('Error checking existing requests:', error);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'revaluationRequests'), {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0],
        reason: formData.reason,
        currentSR: formData.currentSR ? parseInt(formData.currentSR) : null,
        expectedSR: formData.expectedSR ? parseInt(formData.expectedSR) : null,
        additionalInfo: formData.additionalInfo,
        status: 'pending',
        createdAt: new Date(),
        reviewedAt: null,
        reviewedBy: null
      });

      toast.success('Revaluation request submitted successfully!');
      navigate('/profile');
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="revaluation-page">
        <div className="content-wrapper">
          <div className="revaluation-content">
            <LoadingState message="Loading..." />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="revaluation-page">
        <div className="content-wrapper">
          <div className="revaluation-content">
            <div className="auth-prompt-container">
              <h2>AUTHENTICATION REQUIRED</h2>
              <p>PLEASE SIGN IN TO REQUEST A REVALUATION.</p>
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
    <div className="revaluation-page">
      <div className="content-wrapper">
        <div className="revaluation-content">
          <div className="revaluation-header">
            <h1>REQUEST SKILL REVALUATION</h1>
            <button className="save-btn" onClick={() => navigate('/profile')}>
              BACK TO PROFILE
            </button>
          </div>

          {existingRequest && (
            <div className="existing-request-notice">
              <h3>⚠️ PENDING REQUEST</h3>
              <p>You have a pending revaluation request submitted on {new Date(existingRequest.createdAt.toDate()).toLocaleDateString()}.</p>
              <p>Please wait for review before submitting a new request.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="revaluation-form">
            <div className="form-section">
              <h3>REQUEST INFORMATION</h3>
              
              <div className="form-group">
                <label>REASON FOR REVALUATION</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="custom-input"
                  required
                  disabled={!!existingRequest}
                >
                  <option value="">Select a reason...</option>
                  <option value="improved_performance">Improved Performance</option>
                  <option value="incorrect_rating">Incorrect Initial Rating</option>
                  <option value="long_absence">Return from Long Absence</option>
                  <option value="team_change">Team/Environment Change</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>CURRENT SKILL RATING (SR)</label>
                <input
                  type="number"
                  value={formData.currentSR}
                  onChange={(e) => setFormData({ ...formData, currentSR: e.target.value })}
                  className="custom-input"
                  placeholder="e.g. 3200"
                  min="0"
                  max="5000"
                  disabled={!!existingRequest}
                />
              </div>

              <div className="form-group">
                <label>EXPECTED SKILL RATING (SR)</label>
                <input
                  type="number"
                  value={formData.expectedSR}
                  onChange={(e) => setFormData({ ...formData, expectedSR: e.target.value })}
                  className="custom-input"
                  placeholder="e.g. 3800"
                  min="0"
                  max="5000"
                  disabled={!!existingRequest}
                />
              </div>

              <div className="form-group">
                <label>ADDITIONAL INFORMATION</label>
                <textarea
                  value={formData.additionalInfo}
                  onChange={(e) => setFormData({ ...formData, additionalInfo: e.target.value })}
                  className="custom-input"
                  placeholder="Provide any additional context or evidence for your revaluation request..."
                  rows="6"
                  disabled={!!existingRequest}
                />
                <p className="form-hint">
                  Include match history, recent achievements, or any other relevant information.
                </p>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="save-btn secondary" onClick={() => navigate('/profile')}>
                CANCEL
              </button>
              <button type="submit" className="save-btn" disabled={submitting || !!existingRequest}>
                {submitting ? 'SUBMITTING...' : 'SUBMIT REQUEST'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Revaluation;

