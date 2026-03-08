import React, { useState } from 'react';
import { addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { updateTeamReliability } from '../../utils/teamReliability';
import { createNotification } from '../../utils/notifications';
import Modal from './Modal';
import './ReviewModal.css';

const ReviewModal = ({ isOpen, onClose, scrimRequest, myTeam, targetTeam, currentUser, onReviewSubmitted }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Check if review already exists
      const existingReviewQuery = query(
        collection(db, 'teamReviews'),
        where('teamId', '==', targetTeam.id),
        where('fromTeamId', '==', myTeam.id),
        where('scrimRequestId', '==', scrimRequest.id)
      );
      const existingReview = await getDocs(existingReviewQuery);
      
      if (!existingReview.empty) {
        setError('You have already left a review for this scrim');
        setSubmitting(false);
        return;
      }

      // Create review
      const reviewData = {
        teamId: targetTeam.id,
        fromTeamId: myTeam.id,
        fromTeamName: myTeam.name,
        rating: rating,
        comment: comment.trim() || null,
        createdAt: new Date(),
        scrimRequestId: scrimRequest.id
      };

      const docRef = await addDoc(collection(db, 'teamReviews'), reviewData);
      
      // Notify target team's managers
      if (targetTeam.members) {
        targetTeam.members.forEach(m => {
          if (m.roles?.includes('Manager') || m.roles?.includes('Owner')) {
            createNotification(m.uid, {
              type: 'review',
              title: 'New Team Review',
              message: `${myTeam.name} left a ${rating}-star review for your team.`,
              actionData: { teamId: targetTeam.id, reviewId: docRef.id }
            });
          }
        });
      }

      // Update team reliability based on rating
      const deltaMap = { 1: -5, 2: -2, 3: 0, 4: 2, 5: 5 };
      const delta = deltaMap[rating] || 0;
      if (delta !== 0) {
        await updateTeamReliability(targetTeam.id, delta);
      }

      onReviewSubmitted(reviewData);
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error submitting review:', error);
      setError('Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setRating(0);
    setHoverRating(0);
    setComment('');
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen || !targetTeam || !myTeam) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Review ${targetTeam?.name || 'Team'}`}
      message=""
      type="info"
    >
      <form onSubmit={handleSubmit} className="review-form">
        <div className="review-rating-section">
          <label className="review-label">RATING</label>
          <div className="star-rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`star-btn ${star <= (hoverRating || rating) ? 'active' : ''}`}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
              >
                ★
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="rating-text">
              {rating === 1 && 'Poor'}
              {rating === 2 && 'Fair'}
              {rating === 3 && 'Good'}
              {rating === 4 && 'Very Good'}
              {rating === 5 && 'Excellent'}
            </p>
          )}
        </div>

        <div className="review-comment-section">
          <label className="review-label" htmlFor="review-comment">
            COMMENT (OPTIONAL)
          </label>
          <textarea
            id="review-comment"
            className="review-textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience with this team..."
            rows="4"
            maxLength={500}
          />
          <span className="char-count">{comment.length}/500</span>
        </div>

        {error && <div className="review-error">{error}</div>}

        <div className="review-form-actions">
          <button type="button" className="review-cancel-btn" onClick={handleClose}>
            CANCEL
          </button>
          <button type="submit" className="review-submit-btn" disabled={submitting || rating === 0}>
            {submitting ? 'SUBMITTING...' : 'SUBMIT REVIEW'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReviewModal;

