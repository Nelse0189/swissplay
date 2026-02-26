import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase/config';
import { collection, addDoc } from 'firebase/firestore';
import { useToast } from '../context/ToastContext';
import './Contact.css';

const Contact = () => {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    category: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setFormData(prev => ({
          ...prev,
          name: currentUser.displayName || currentUser.email?.split('@')[0] || '',
          email: currentUser.email || ''
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await addDoc(collection(db, 'contactMessages'), {
        ...formData,
        userId: user?.uid || null,
        status: 'new',
        createdAt: new Date()
      });

      toast.success('Message sent successfully! We will get back to you soon.');
      setFormData({
        name: user?.displayName || user?.email?.split('@')[0] || '',
        email: user?.email || '',
        subject: '',
        message: '',
        category: ''
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="contact-page">
      <div className="content-wrapper">
        <div className="contact-content">
          <div className="contact-header">
            <h1>CONTACT SUPPORT</h1>
            <button className="save-btn" onClick={() => navigate('/help')}>
              VIEW HELP
            </button>
          </div>

          <div className="contact-info">
            <div className="info-card">
              <h3>DISCORD</h3>
              <p>Join our Discord server for real-time support</p>
              <a href="https://discord.gg/rFUX24TeXc" target="_blank" rel="noopener noreferrer" className="contact-link">Join Discord</a>
            </div>
            <div className="info-card">
              <h3>RESPONSE TIME</h3>
              <p>We typically respond within 24-48 hours</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="contact-form">
            <div className="form-section">
              <h3>CONTACT FORM</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label>NAME</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="custom-input"
                    required
                    disabled={!!user}
                  />
                </div>

                <div className="form-group">
                  <label>EMAIL</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="custom-input"
                    required
                    disabled={!!user}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>CATEGORY</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="custom-input"
                  required
                >
                  <option value="">Select a category...</option>
                  <option value="technical">Technical Issue</option>
                  <option value="account">Account Problem</option>
                  <option value="team">Team Management</option>
                  <option value="rating">Rating/Revaluation</option>
                  <option value="feature">Feature Request</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>SUBJECT</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="custom-input"
                  placeholder="Brief description of your issue"
                  required
                />
              </div>

              <div className="form-group">
                <label>MESSAGE</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="custom-input"
                  placeholder="Please provide as much detail as possible..."
                  rows="8"
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="save-btn" disabled={submitting}>
                {submitting ? 'SENDING...' : 'SEND MESSAGE'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Contact;

