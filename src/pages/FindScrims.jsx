import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, updateDoc, doc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { rankToSr } from '../constants/overwatchRanks';
import LoadingState from '../components/UI/LoadingState';
import CustomDropdown from '../components/UI/CustomDropdown';
import Modal from '../components/UI/Modal';
import ReviewModal from '../components/UI/ReviewModal';
import PlayerProfileModal from '../components/UI/PlayerProfileModal';
import confetti from 'canvas-confetti';
import { createNotification } from '../utils/notifications';
import './FindScrims.css';

import { RELIABILITY_DEFAULT, updateTeamReliability } from '../utils/teamReliability';

// Helper function to get next occurrence of a day/hour and format it
const getNextOccurrenceDate = (day, hour) => {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const currentDay = now.getDay();
  const targetDayIndex = daysOfWeek.indexOf(day);
  
  if (targetDayIndex === -1) return null;
  
  // Calculate days until next occurrence
  let daysUntilTarget = targetDayIndex - currentDay;
  if (daysUntilTarget < 0) {
    daysUntilTarget += 7; // Next week
  } else if (daysUntilTarget === 0) {
    // If it's today, check if the hour has passed
    const currentHour = now.getHours();
    if (hour <= currentHour) {
      daysUntilTarget = 7; // Next week
    }
  }
  
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + daysUntilTarget);
  targetDate.setHours(hour, 0, 0, 0);
  
  return targetDate;
};

// Format date as "MM/DD/YY Day HH:00 EST"
const formatSlotTime = (dayOrSlot, hour, createdAt) => {
  let date;
  let day, slotHour;
  
  if (typeof dayOrSlot === 'object' && dayOrSlot !== null) {
    day = dayOrSlot.day;
    slotHour = dayOrSlot.hour;
    if (dayOrSlot.actualDate) {
      date = new Date(dayOrSlot.actualDate);
    } else if (dayOrSlot.scheduledDate) {
      date = new Date(dayOrSlot.scheduledDate);
    }
  } else {
    day = dayOrSlot;
    slotHour = hour;
  }
  
  if (!date) {
    if (createdAt) {
      const created = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDayIndex = daysOfWeek.indexOf(day);
      const createdDay = created.getDay();
      
      let daysUntilTarget = targetDayIndex - createdDay;
      if (daysUntilTarget < 0) {
        daysUntilTarget += 7; // Next week
      } else if (daysUntilTarget === 0 && created.getHours() > slotHour) {
        daysUntilTarget += 7; // Next week if hour has passed on creation day
      }
      
      date = new Date(created);
      date.setDate(created.getDate() + daysUntilTarget);
      date.setHours(slotHour, 0, 0, 0);
    } else {
      date = getNextOccurrenceDate(day, slotHour);
    }
  }
  
  if (!date) return `${day} ${slotHour}:00`;
  
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  
  // Determine if DST is active (EST vs EDT)
  // DST in US typically runs from second Sunday in March to first Sunday in November
  const yearNum = date.getFullYear();
  const march = new Date(yearNum, 2, 1); // March 1
  const november = new Date(yearNum, 10, 1); // November 1
  const dstStart = new Date(yearNum, 2, 14 - march.getDay()); // Second Sunday in March
  const dstEnd = new Date(yearNum, 10, 7 - november.getDay()); // First Sunday in November
  
  const isDST = date >= dstStart && date < dstEnd;
  const timeZone = isDST ? 'EDT' : 'EST';
  
  return `${month}/${dayOfMonth} ${day.substring(0, 3)} ${slotHour}:00 ${timeZone}`;
};

// Calculate hours until scrim
const getHoursUntilScrim = (day, hour, createdAt) => {
  const now = new Date();
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDayIndex = daysOfWeek.indexOf(day);
  
  if (targetDayIndex === -1) return null;
  
  let scrimDate;
  
  // If we have a createdAt, find the first occurrence after that date
  if (createdAt) {
    const created = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const createdDay = created.getDay();
    let daysUntilTarget = targetDayIndex - createdDay;
    if (daysUntilTarget < 0) daysUntilTarget += 7;
    
    scrimDate = new Date(created);
    scrimDate.setDate(created.getDate() + daysUntilTarget);
    scrimDate.setHours(hour, 0, 0, 0);
    
    // If this date is in the past, move to next week
    if (scrimDate < now) {
      scrimDate.setDate(scrimDate.getDate() + 7);
    }
  } else {
    // Use next occurrence from today
    scrimDate = getNextOccurrenceDate(day, hour);
    if (!scrimDate) return null;
  }
  
  const hoursUntil = (scrimDate - now) / (1000 * 60 * 60);
  return hoursUntil;
};

// Team reliability score: 0-100, default 100. Drops when cancelling scrims, rises when responding quickly.
const getReliabilityTier = (score) => {
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
};

const FindScrims = () => {
  const [teams, setTeams] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scrimRequests, setScrimRequests] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [reviewModal, setReviewModal] = useState({ isOpen: false, scrimRequest: null });
  const [reviews, setReviews] = useState([]);
  const [playerProfileModal, setPlayerProfileModal] = useState({ isOpen: false, player: null, team: null });

  // Debug modal state changes
  useEffect(() => {
    console.log('[FindScrims] playerProfileModal state:', playerProfileModal);
  }, [playerProfileModal]);

  // Filters
  const [divisionFilter, setDivisionFilter] = useState('All');
  const [dayFilter, setDayFilter] = useState('All');

  const divisionOptions = [
    { value: 'All', label: 'All Divisions' },
    { value: 'OWCS', label: 'OWCS' },
    { value: 'Masters', label: 'Masters' },
    { value: 'Advanced', label: 'Advanced' },
    { value: 'Expert', label: 'Expert' },
    { value: 'Open', label: 'Open' }
  ];

  const dayOptions = [
    { value: 'All', label: 'Any Day' },
    { value: 'Monday', label: 'Monday' },
    { value: 'Tuesday', label: 'Tuesday' },
    { value: 'Wednesday', label: 'Wednesday' },
    { value: 'Thursday', label: 'Thursday' },
    { value: 'Friday', label: 'Friday' },
    { value: 'Saturday', label: 'Saturday' },
    { value: 'Sunday', label: 'Sunday' }
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        loadTeams();
        loadUserTeams();
        loadScrimRequests();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);


  // Load reviews when selectedTeam changes
  useEffect(() => {
    if (selectedTeam && currentUser) {
      loadReviews();
    }
  }, [selectedTeam, currentUser]);

  const loadTeams = async () => {
    try {
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      const teamsData = teamsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTeams(teamsData);
    } catch (error) {
      console.error('Error loading teams:', error);
    }
  };

  const loadUserTeams = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    
    try {
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      const teamsData = teamsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => t.members && t.members.some(m => m.uid === currentUser.uid));
        
      setUserTeams(teamsData);
      // Only set selectedTeam if we have teams and it's not already a valid team
      if (teamsData.length > 0) {
        setSelectedTeam(prev => {
          if (!teamsData.find(t => t.id === prev)) {
            return teamsData[0].id;
          }
          return prev;
        });
      } else {
        setSelectedTeam(null);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading user teams:', error);
      setLoading(false);
    }
  };

  const loadScrimRequests = async () => {
    if (!currentUser) return;
    try {
      const requestsSnapshot = await getDocs(collection(db, 'scrimRequests'));
      const requestsData = requestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setScrimRequests(requestsData);
      // Load reviews to check if user has already reviewed
      await loadReviews();
    } catch (error) {
      console.error('Error loading scrim requests:', error);
    }
  };

  const loadReviews = async () => {
    if (!selectedTeam || !currentUser) return;
    try {
      const reviewsSnapshot = await getDocs(
        query(collection(db, 'teamReviews'), where('fromTeamId', '==', selectedTeam))
      );
      const reviewsData = reviewsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReviews(reviewsData);
    } catch (error) {
      console.error('Error loading reviews:', error);
    }
  };

  const handleReviewSubmitted = async (reviewData) => {
    await loadReviews(); // Reload to ensure consistency
    showModal('Review Submitted', 'Thank you for your review!', 'success');
  };

  const findMatchingTeams = () => {
    if (!selectedTeam) return [];

    const availableTeams = teams;

    // Check both teams and userTeams arrays for the selected team
    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
    
    if (!myTeam || !myTeam.schedule) return [];

    const mySlots = new Set(myTeam.schedule.map(s => `${s.day}-${s.hour}`));
    
    return availableTeams.filter(team => {
      if (team.id === selectedTeam) return false;
      if (!team.schedule || team.schedule.length === 0) return false;

      if (divisionFilter !== 'All' && team.faceitDiv !== divisionFilter) {
        return false;
      }

      if (dayFilter !== 'All') {
        const hasDayAvailability = team.schedule.some(s => s.day === dayFilter);
        if (!hasDayAvailability) return false;
      }

      const hasOverlap = team.schedule.some(slot => {
        const slotKey = `${slot.day}-${slot.hour}`;
        return mySlots.has(slotKey);
      });

      if (dayFilter !== 'All') {
        return team.schedule.some(slot => {
           const slotKey = `${slot.day}-${slot.hour}`;
           return slot.day === dayFilter && mySlots.has(slotKey);
        });
      }

      return hasOverlap;
    });
  };

  // Smart match score 0-100: reliability, rank, schedule overlap, region
  const getMatchScore = (myTeam, otherTeam) => {
    let score = 0;
    const weights = { reliability: 25, rank: 25, schedule: 30, region: 20 };

    // Region: same = full points
    if (myTeam.region && otherTeam.region) {
      score += myTeam.region === otherTeam.region ? weights.region : 0;
    } else {
      score += weights.region / 2; // Unknown = half
    }

    // Reliability: closer = better (within 15 = good)
    const myRel = myTeam.reliabilityScore ?? 100;
    const theirRel = otherTeam.reliabilityScore ?? 100;
    const relDiff = Math.abs(myRel - theirRel);
    score += Math.max(0, weights.reliability - (relDiff / 15) * weights.reliability);

    // Rank (SR): closer = better (within 500 = good). Support rank string or legacy numeric sr.
    const mySr = rankToSr(myTeam.sr) ?? 3000;
    const theirSr = rankToSr(otherTeam.sr) ?? 3000;
    const srDiff = Math.abs(mySr - theirSr);
    score += Math.max(0, weights.rank - (srDiff / 500) * weights.rank);

    // Schedule: more overlap = better
    const mySlots = new Set((myTeam.schedule || []).map(s => `${s.day}-${s.hour}`));
    const theirSlots = otherTeam.schedule || [];
    const overlapCount = theirSlots.filter(s => mySlots.has(`${s.day}-${s.hour}`)).length;
    const minSlots = Math.max(1, Math.min(mySlots.size, theirSlots.length));
    score += (overlapCount / minSlots) * weights.schedule;

    return Math.round(Math.min(100, score));
  };

  const getMatchingSlots = (otherTeam) => {
    const availableTeams = teams;

    // Check both teams and userTeams arrays for the selected team
    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
    if (!myTeam || !myTeam.schedule) return [];
    
    const mySlots = new Set(myTeam.schedule.map(s => `${s.day}-${s.hour}`));
    
    let matches = otherTeam.schedule.filter(slot => {
      const slotKey = `${slot.day}-${slot.hour}`;
      return mySlots.has(slotKey);
    });

    if (dayFilter !== 'All') {
      matches = matches.filter(slot => slot.day === dayFilter);
    }

    return matches;
  };

  const getRequestStatusForSlot = (targetTeamId, slot) => {
    if (!selectedTeam) return null;

    const availableTeams = teams;
    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
    const targetTeam = availableTeams.find(t => t.id === targetTeamId);

    if (!myTeam || !targetTeam) return null;

    const request = scrimRequests.find(req => {
      return (
        ((req.fromTeamId === selectedTeam && req.toTeamId === targetTeamId) ||
         (req.fromTeamId === targetTeamId && req.toTeamId === selectedTeam)) &&
        req.slot.day === slot.day &&
        req.slot.hour === slot.hour
      );
    });

    return request ? request.status : null;
  };

  // Autolock: team is locked at slot if they have pending/accepted scrim (with anyone)
  const isSlotLockedForTeam = (teamId, teamName, slot) => {
    return scrimRequests.some(req => {
      const matchesSlot = req.slot?.day === slot.day && req.slot?.hour === slot.hour;
      const isActive = req.status === 'pending' || req.status === 'accepted';
      if (!matchesSlot || !isActive) return false;
      return req.fromTeamId === teamId || req.toTeamId === teamId;
    });
  };

  const isSlotLockedForMyTeam = (slot) => {
    if (!selectedTeam) return false;
    const availableTeams = teams;
    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
    return myTeam ? isSlotLockedForTeam(selectedTeam, myTeam.name, slot) : false;
  };

  const showModal = (title, message, type = 'info') => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' });
  };

  const requestScrim = async (targetTeamId, slot) => {
    if (!selectedTeam || !currentUser) {
      showModal('Team Selection Required', 'Please select your team first.', 'warning');
      return;
    }

    // Get team names for display
    const availableTeams = teams;
    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
    const targetTeam = availableTeams.find(t => t.id === targetTeamId);

    if (!myTeam || !targetTeam) {
      showModal('Team Not Found', 'Team information not found.', 'error');
      return;
    }

    // Check if request already exists for this slot
    const existingRequest = scrimRequests.find(req => {
      return (
        ((req.fromTeamId === selectedTeam && req.toTeamId === targetTeamId) ||
         (req.fromTeamId === targetTeamId && req.toTeamId === selectedTeam)) &&
        req.slot.day === slot.day &&
        req.slot.hour === slot.hour &&
        req.status !== 'rejected'
      );
    });

    if (existingRequest) {
      showModal(
        'Request Already Exists',
        `A request already exists for ${formatSlotTime(slot.day, slot.hour)} with ${targetTeam.name}.`,
        'warning'
      );
      return;
    }

    // Autolock: neither team can book if already committed at this slot
    const myLocked = isSlotLockedForMyTeam(slot);
    const theirLocked = isSlotLockedForTeam(targetTeamId, targetTeam.name, slot);
    if (myLocked) {
      showModal(
        'Slot Locked',
        `Your team already has a scrim at ${formatSlotTime(slot.day, slot.hour)}. Cancel or reschedule it first.`,
        'warning'
      );
      return;
    }
    if (theirLocked) {
      showModal(
        'Slot Locked',
        `${targetTeam.name} already has a scrim at ${formatSlotTime(slot.day, slot.hour)}. Try another time.`,
        'warning'
      );
      return;
    }

    try {
      // Calculate the actual scrim date
      const scrimDate = getNextOccurrenceDate(slot.day, slot.hour);
      
      // Create Firestore document
      const requestData = {
        fromTeamId: selectedTeam,
        fromTeamName: myTeam.name,
        toTeamId: targetTeamId,
        toTeamName: targetTeam.name,
        slot: { day: slot.day, hour: slot.hour, scheduledDate: scrimDate },
        status: 'pending',
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'scrimRequests'), requestData);

      // Notify target team's managers
      if (targetTeam && targetTeam.members) {
        targetTeam.members.forEach(m => {
          if (m.roles?.includes('Manager') || m.roles?.includes('Owner')) {
            createNotification(m.uid, {
              type: 'scrim_request',
              title: 'New Scrim Request',
              message: `${myTeam.name} has requested a scrim for ${formatSlotTime(slot.day, slot.hour)}.`,
              actionData: { teamId: targetTeamId, requestId: docRef.id }
            });
          }
        });
      }

      await loadScrimRequests(); // Reload to show the new request
      showModal(
        'Request Sent',
        `Scrim request sent to ${targetTeam.name} for ${formatSlotTime(slot.day, slot.hour)}!`,
        'success'
      );
    } catch (error) {
      console.error('Error creating scrim request:', error);
      showModal('Error', 'Failed to send scrim request. Please try again.', 'error');
    }
  };

  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  };

  const updateRequestStatus = async (requestId, status) => {
    if (status === 'accepted') {
      triggerConfetti();
    }

    const request = scrimRequests.find(r => r.id === requestId);
    const respondedAt = new Date();

    try {
      await updateDoc(doc(db, 'scrimRequests', requestId), {
        status,
        respondedAt,
      });

      // Notify the requesting team's managers
      if (request?.fromTeamId) {
        const fromTeam = teams.find(t => t.id === request.fromTeamId) || userTeams.find(t => t.id === request.fromTeamId);
        if (fromTeam && fromTeam.members) {
          fromTeam.members.forEach(m => {
            if (m.roles?.includes('Manager') || m.roles?.includes('Owner')) {
              createNotification(m.uid, {
                type: 'scrim_response',
                title: `Scrim Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                message: `${request.toTeamName} has ${status} your scrim request for ${formatSlotTime(request.slot.day, request.slot.hour)}.`,
                actionData: { teamId: request.fromTeamId, requestId }
              });
            }
          });
        }
      }

      // Update responding team's reliability based on response time
      if (request?.toTeamId) {
        const createdAt = request.createdAt?.toDate?.() || new Date(request.createdAt);
        const responseHours = (respondedAt - createdAt) / (1000 * 60 * 60);
        let delta = 0;
        if (responseHours < 4) delta = 4;
        else if (responseHours < 24) delta = 2;
        else if (responseHours > 48) delta = -2;
        if (delta !== 0) await updateTeamReliability(request.toTeamId, delta);
      }
      // Bonus for picking up a scrim that was dropped within 1h of start
      if (status === 'accepted' && request?.toTeamId && request?.slot) {
        const droppedSnapshot = await getDocs(
          query(
            collection(db, 'droppedScrims'),
            where('slotDay', '==', request.slot.day),
            where('slotHour', '==', request.slot.hour)
          )
        );
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const validDrop = droppedSnapshot.docs.find(d => {
          const droppedAt = d.data().droppedAt?.toDate?.() || new Date(d.data().droppedAt);
          return droppedAt > twoHoursAgo;
        });
        if (validDrop) {
          await updateTeamReliability(request.toTeamId, 5);
          await deleteDoc(doc(db, 'droppedScrims', validDrop.id));
        }
      }
      await loadScrimRequests();
    } catch (error) {
      console.error('Error updating request:', error);
    }
  };

  const cancelScrimRequest = async (request) => {
    if (!request) return;
    
    const hoursUntil = getHoursUntilScrim(request.slot.day, request.slot.hour, request.createdAt);
    const minHoursRequired = 24; // Minimum hours before scrim to cancel without penalty (12-24 hrs as requested)
    const lastMinuteDropThreshold = 1; // Dropped within 1h of start = last-minute drop (another team can get bonus for picking it up)
    
    let shouldProceed = false;
    
    if (hoursUntil !== null && hoursUntil < minHoursRequired) {
      const penaltyHours = minHoursRequired - hoursUntil;
      const confirmMessage = `WARNING: This scrim is in ${Math.round(hoursUntil)} hours. ` +
        `Canceling less than ${minHoursRequired} hours in advance will result in a penalty. ` +
        `You are ${Math.round(penaltyHours)} hours late. Continue?`;
      
      shouldProceed = window.confirm(confirmMessage);
      
      if (!shouldProceed) {
        return;
      }
    } else {
      const confirmMessage = `Cancel scrim request with ${request.toTeamName} on ${formatSlotTime(request.slot, null, request.createdAt)}?`;
      shouldProceed = window.confirm(confirmMessage);
      
      if (!shouldProceed) {
        return;
      }
    }
    
    try {
      // Record last-minute drop (within 1h of start) so a team that picks it up gets a bonus
      if (hoursUntil !== null && hoursUntil < lastMinuteDropThreshold && hoursUntil > 0) {
        await addDoc(collection(db, 'droppedScrims'), {
          slotDay: request.slot.day,
          slotHour: request.slot.hour,
          droppedAt: new Date(),
          requestId: request.id,
        });
      }
      // Update cancelling team's reliability before deleting
      const cancellingTeamId = request.fromTeamId === selectedTeam ? request.fromTeamId : request.toTeamId;
      if (cancellingTeamId) {
        let penalty = 0;
        if (request.status === 'accepted') {
          penalty = -10; // Dropping confirmed scrim
        } else if (hoursUntil !== null && hoursUntil < minHoursRequired) {
          penalty = -3; // Late cancel (within 24h of scrim)
        } else {
          penalty = -1; // Early cancel
        }
        await updateTeamReliability(cancellingTeamId, penalty);
      }
      await deleteDoc(doc(db, 'scrimRequests', request.id));
      await loadScrimRequests();
      if (hoursUntil !== null && hoursUntil < minHoursRequired) {
        const penaltyHours = minHoursRequired - hoursUntil;
        showModal(
          'Penalty Applied',
          `Scrim canceled with penalty. You canceled ${Math.round(penaltyHours)} hours late. ` +
          `Future cancellations within ${minHoursRequired} hours may result in restrictions.`,
          'warning'
        );
      } else {
        showModal('Scrim Canceled', 'The scrim request has been canceled.', 'success');
      }
    } catch (error) {
      console.error('Error canceling scrim request:', error);
      showModal('Error', 'Failed to cancel scrim request. Please try again.', 'error');
    }
  };

  const reportNoShow = async (request) => {
    if (!request || !selectedTeam) return;
    const noShowTeamId = request.fromTeamId === selectedTeam ? request.toTeamId : request.fromTeamId;
    const noShowTeamName = request.fromTeamId === selectedTeam ? request.toTeamName : request.fromTeamName;
    if (!noShowTeamId && !noShowTeamName) return;

    const confirmed = window.confirm(
      `Report ${noShowTeamName} as no-show? This will lower their reliability score. This action cannot be undone.`
    );
    if (!confirmed) return;

    const NO_SHOW_PENALTY = -15;

    try {
      await updateDoc(doc(db, 'scrimRequests', request.id), {
        noShowReportedBy: selectedTeam,
        noShowReportedAt: new Date(),
      });
      await updateTeamReliability(noShowTeamId, NO_SHOW_PENALTY);
      await loadScrimRequests();
      showModal('No-Show Reported', `${noShowTeamName} has been reported. Their reliability score has been reduced.`, 'success');
    } catch (error) {
      console.error('Error reporting no-show:', error);
      showModal('Error', 'Failed to report no-show. Please try again.', 'error');
    }
  };

  const openReviewModal = (request) => {
    setReviewModal({ isOpen: true, scrimRequest: request });
  };

  const closeReviewModal = () => {
    setReviewModal({ isOpen: false, scrimRequest: null });
  };

  // Check if a scrim slot has already passed (scrim duration is 1 hour)
  const isScrimInPast = (slot, requestCreatedAt) => {
    if (!slot || !slot.day || slot.hour === undefined) return false;

    // If the request has an actualDate (from mock data), use it directly
    if (slot.actualDate) {
      const actualEndDate = new Date(slot.actualDate);
      actualEndDate.setHours(actualEndDate.getHours() + 1);
      return actualEndDate <= new Date();
    }

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const slotDayIndex = daysOfWeek.indexOf(slot.day);
    
    if (slotDayIndex === -1) return false;

    // If we have a createdAt date, find the first occurrence of this slot after creation
    if (requestCreatedAt) {
      const createdAt = requestCreatedAt.toDate ? requestCreatedAt.toDate() : new Date(requestCreatedAt);
      const createdDay = createdAt.getDay();
      
      // Calculate days until the slot day
      let daysUntilSlot = slotDayIndex - createdDay;
      if (daysUntilSlot < 0) {
        daysUntilSlot += 7; // Next week
      } else if (daysUntilSlot === 0 && createdAt.getHours() > slot.hour) {
        daysUntilSlot += 7; // If created today but after the slot time, it must be next week
      }
      
      // Get the end date of the slot (scrim lasts 1 hour)
      const slotEndDate = new Date(createdAt);
      slotEndDate.setDate(createdAt.getDate() + daysUntilSlot);
      slotEndDate.setHours(slot.hour + 1, 0, 0, 0);
      
      // If this slot end date is in the past, the scrim is over
      return slotEndDate <= now;
    }

    // Fallback: Find the most recent occurrence of this day/hour
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    // Calculate days until next occurrence
    let daysUntilSlot = slotDayIndex - currentDay;
    if (daysUntilSlot < 0) {
      daysUntilSlot += 7; // Next week
    }
    
    const slotEndDate = new Date(now);
    slotEndDate.setDate(now.getDate() + daysUntilSlot);
    slotEndDate.setHours(slot.hour + 1, 0, 0, 0);

    // If it's today, check if the scrim has ended
    if (daysUntilSlot === 0) {
      if (currentHour >= slot.hour + 1) return true;
      return false;
    }
    
    // If daysUntilSlot > 0, the next occurrence is in the future
    // Check the previous week's occurrence
    slotEndDate.setDate(slotEndDate.getDate() - 7);
    return slotEndDate <= now;
  };

  const hasReviewedTeam = (request) => {
    if (!request || !selectedTeam) return false;
    
    // Determine which team is being reviewed
    let targetTeamId;
    // For real data, check team IDs
    if (request.fromTeamId === selectedTeam) {
      targetTeamId = request.toTeamId;
    } else {
      targetTeamId = request.fromTeamId;
    }
    
    // Check if review exists for this team and scrim request
    return reviews.some(r => r.teamId === targetTeamId && r.scrimRequestId === request.id);
  };

  const rawMatchingTeams = findMatchingTeams();
  const availableTeamsForScore = teams;
  const myTeamForScore = availableTeamsForScore.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
  const matchingTeams = myTeamForScore
    ? rawMatchingTeams
      .map(team => ({ team, matchScore: getMatchScore(myTeamForScore, team) }))
      .sort((a, b) => (b.matchScore - a.matchScore))
      .map(({ team, matchScore }) => ({ ...team, matchScore }))
    : rawMatchingTeams;
  const incomingRequests = scrimRequests.filter(r => {
    return r.toTeamId === selectedTeam && r.status === 'pending';
  });
  const myRequests = scrimRequests.filter(r => {
    return r.fromTeamId === selectedTeam;
  });

  const PageWrapper = ({ children }) => (
    <div className="find-scrims-page">
      <div className="content-wrapper">
        <div className="dashboard-content">
          {children}
        </div>
      </div>
    </div>
  );

  if (loading) return <PageWrapper><LoadingState message="Loading data..." /></PageWrapper>;

  if (!currentUser) {
    return (
      <PageWrapper>
         <div className="auth-prompt-container">
          <h2>AUTHENTICATION REQUIRED</h2>
          <p>PLEASE SIGN IN TO ACCESS SCRIM PROTOCOLS.</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="dashboard-header">
        <h1>FIND SCRIMS</h1>
      </div>

      <div className="team-selector-container">
        <div className="form-group">
           <label>SELECT YOUR TEAM:</label>
           <CustomDropdown
              options={[
                { value: '', label: '-- SELECT TEAM --' },
                ...userTeams.map(team => ({ value: team.id, label: team.name }))
              ]}
              value={selectedTeam || ''}
              onChange={setSelectedTeam}
              placeholder="-- SELECT TEAM --"
            />
        </div>
      </div>

      {selectedTeam && (
        <>
          <div className="filters-section">
            <div className="form-row">
              <div className="form-group">
                <label>FILTER BY DIVISION</label>
                <CustomDropdown 
                  options={divisionOptions}
                  value={divisionFilter}
                  onChange={setDivisionFilter}
                />
              </div>
              <div className="form-group">
                <label>FILTER BY DAY</label>
                <CustomDropdown 
                  options={dayOptions}
                  value={dayFilter}
                  onChange={setDayFilter}
                />
              </div>
            </div>
          </div>

          <div className="matching-teams-section">
            <h2>AVAILABLE OPPONENTS</h2>
            <p className="matching-teams-subtitle">Sorted by smart match — reliability, rank, schedule & region</p>
            {matchingTeams.length > 0 ? (
              <div className="teams-grid">
                {matchingTeams.map(team => {
                  const matchingSlots = getMatchingSlots(team);
                  return (
                    <div key={team.id} className="team-card">
                      <div className="team-card-header">
                        <div className="team-card-header-left">
                          <img 
                            src={team.photoURL || '/default-team.svg'} 
                            alt={team.name}
                            className="team-card-avatar"
                            onError={(e) => {
                              e.target.src = '/default-team.svg';
                            }}
                          />
                          <div className="team-card-header-info">
                            <h3>{team.name}</h3>
                            <div className="team-card-meta">
                              <span>REGION: {team.region}</span>
                              <span>{typeof team.sr === 'number' ? `SR: ${team.sr}` : (team.sr || 'N/A')}</span>
                              <span className={`reliability-badge reliability-${getReliabilityTier(team.reliabilityScore ?? 100)}`} title="Team reliability: responds quickly, rarely drops scrims">
                                RELIABILITY: {team.reliabilityScore ?? 100}
                              </span>
                              {team.matchScore != null && (
                                <span className="match-score-badge" title="Smart match: reliability, rank, schedule & region">
                                  MATCH: {team.matchScore}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="team-card-badges">
                          <span className="badge">{team.faceitDiv || 'OPEN'}</span>
                          {team.matchScore >= 75 && (
                            <span className="badge suggested-badge" title={`Match score: ${team.matchScore}% — similar reliability, rank, schedule & region`}>
                              SUGGESTED
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {team.members && team.members.length > 0 && (
                        <div className="team-card-players">
                          <h4>PLAYERS ({team.members.length})</h4>
                          <div className="team-players-list">
                            {team.members.slice(0, 6).map((member, idx) => (
                              <div 
                                key={member.uid || idx} 
                                className="team-player-item"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('[FindScrims] Player clicked:', { 
                                    member: { name: member.name, uid: member.uid },
                                    team: { id: team.id, name: team.name }
                                  });
                                  setPlayerProfileModal({ isOpen: true, player: member, team: team });
                                  console.log('[FindScrims] Modal state set:', { isOpen: true, player: member.name, team: team.name });
                                }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                <img 
                                  src={member.photoURL || '/default-avatar.png'} 
                                  alt={member.name}
                                  className="team-player-avatar"
                                  onError={(e) => {
                                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTIiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPgo8cGF0aCBkPSJNMTIgN0MxMC4zNDMxIDcgOSA4LjM0MzEgOSAxMEM5IDExLjY1NjkgMTAuMzQzMSAxMyAxMiAxM0MxMy42NTY5IDEzIDE1IDExLjY1NjkgMTUgMTBDMTUgOC4zNDMxIDEzLjY1NjkgNyAxMiA3Wk0xMiAxNkM4LjY4NjMgMTYgNiAxNy43OTA5IDYgMjBIMThDMTggMTcuNzkwOSAxNS4zMTM3IDE2IDEyIDE2WiIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjUpIi8+Cjwvc3ZnPg==';
                                  }}
                                />
                                <span className="team-player-name">{member.name}</span>
                              </div>
                            ))}
                            {team.members.length > 6 && (
                              <div className="team-player-item">
                                <span className="team-player-name">+{team.members.length - 6} more</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="matching-slots">
                        <strong>AVAILABLE TIMES:</strong>
                        {matchingSlots.length > 0 ? (
                          matchingSlots.map((slot, idx) => {
                            const requestStatus = getRequestStatusForSlot(team.id, slot);
                            const isPending = requestStatus === 'pending';
                            const isAccepted = requestStatus === 'accepted';
                            const isRejected = requestStatus === 'rejected';
                            const myLocked = isSlotLockedForMyTeam(slot);
                            const theirLocked = isSlotLockedForTeam(team.id, team.name, slot);
                            const isLocked = !requestStatus && (myLocked || theirLocked);
                            
                            return (
                              <div key={idx} className="slot-item">
                                <span className="slot-time">{formatSlotTime(slot.day, slot.hour)}</span>
                                {requestStatus ? (
                                  <span className={`status-badge status-${requestStatus}`}>
                                    {requestStatus.toUpperCase()}
                                  </span>
                                ) : isLocked ? (
                                  <span className="status-badge status-locked" title={myLocked ? 'Your team has a scrim at this time' : `${team.name} has a scrim at this time`}>
                                    LOCKED
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => requestScrim(team.id, slot)}
                                    className="request-btn-small"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                                      <path d="M5 12h14"></path>
                                      <path d="m12 5 7 7-7 7"></path>
                                    </svg>
                                    REQUEST
                                  </button>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="slot-item">NO MATCHING TIMES</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="no-teams">NO MATCHING TEAMS FOUND.</p>
            )}
          </div>

          <div className="requests-section">
            <h2>SCRIM REQUESTS</h2>
            
            <div className="requests-grid">
              <div className="incoming-requests">
                <h3>INCOMING</h3>
                {incomingRequests.length > 0 ? (
                  incomingRequests.map(request => {
                    const availableTeams = teams;
                    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
                    const targetTeam = availableTeams.find(t => t.id === request.fromTeamId);
                    const canReview = request.status === 'accepted' && 
                                      !hasReviewedTeam(request) && 
                                      isScrimInPast(request.slot, request.createdAt);
                    const canReportNoShow = request.status === 'accepted' &&
                                      isScrimInPast(request.slot, request.createdAt) &&
                                      !request.noShowReportedBy;
                    
                    return (
                      <div key={request.id} className="request-card incoming">
                        <p><strong>{request.fromTeamName}</strong></p>
                        <p className="request-time">{formatSlotTime(request.slot, null, request.createdAt)}</p>
                        {request.status === 'pending' ? (
                          <div className="request-actions">
                            <button
                              onClick={() => updateRequestStatus(request.id, 'accepted')}
                              className="accept-btn"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                              ACCEPT
                            </button>
                            <button
                              onClick={() => updateRequestStatus(request.id, 'rejected')}
                              className="reject-btn"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                              REJECT
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className={`status-text status-${request.status}`}>{request.status.toUpperCase()}</p>
                            {canReportNoShow && (
                              <button
                                onClick={() => reportNoShow(request)}
                                className="no-show-btn"
                                title="Report if they didn't show up"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                  <line x1="12" y1="9" x2="12" y2="13"></line>
                                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                REPORT NO-SHOW
                              </button>
                            )}
                            {request.noShowReportedBy && (
                              <p className="no-show-reported-badge">⚠ NO-SHOW REPORTED</p>
                            )}
                            {canReview && myTeam && targetTeam && (
                              <button
                                onClick={() => openReviewModal(request)}
                                className="review-btn"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                                LEAVE REVIEW
                              </button>
                            )}
                            {request.status === 'accepted' && hasReviewedTeam(request) && (
                              <p className="reviewed-badge">✓ REVIEWED</p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="empty-text">NO INCOMING REQUESTS</p>
                )}
              </div>

              <div className="outgoing-requests">
                <h3>OUTGOING</h3>
                {myRequests.length > 0 ? (
                  myRequests.map(request => {
                    const availableTeams = teams;
                    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
                    const targetTeam = availableTeams.find(t => t.id === request.toTeamId);
                    const canReview = request.status === 'accepted' && 
                                      !hasReviewedTeam(request) && 
                                      isScrimInPast(request.slot, request.createdAt);
                    const canReportNoShow = request.status === 'accepted' &&
                                      isScrimInPast(request.slot, request.createdAt) &&
                                      !request.noShowReportedBy;
                    const hoursUntil = getHoursUntilScrim(request.slot.day, request.slot.hour, request.createdAt);
                    const canCancel = request.status === 'pending' || request.status === 'accepted';
                    const isWithinPenaltyWindow = hoursUntil !== null && hoursUntil < 24;
                    
                    return (
                      <div key={request.id} className="request-card outgoing">
                        <p>VS <strong>{request.toTeamName}</strong></p>
                        <p className="request-time">{formatSlotTime(request.slot, null, request.createdAt)}</p>
                        <p className={`status-text status-${request.status}`}>{request.status.toUpperCase()}</p>
                        {canCancel && (
                          <button
                            onClick={() => cancelScrimRequest(request)}
                            className={`cancel-btn ${isWithinPenaltyWindow ? 'penalty-warning' : ''}`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                            {isWithinPenaltyWindow ? '⚠ CANCEL (PENALTY)' : 'CANCEL'}
                          </button>
                        )}
                        {canReportNoShow && (
                          <button
                            onClick={() => reportNoShow(request)}
                            className="no-show-btn"
                            title="Report if they didn't show up"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                              <line x1="12" y1="9" x2="12" y2="13"></line>
                              <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                            REPORT NO-SHOW
                          </button>
                        )}
                        {request.noShowReportedBy && (
                          <p className="no-show-reported-badge">⚠ NO-SHOW REPORTED</p>
                        )}
                        {canReview && myTeam && targetTeam && (
                          <button
                            onClick={() => openReviewModal(request)}
                            className="review-btn"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', marginRight: '0.4rem', verticalAlign: 'middle' }}>
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                            LEAVE REVIEW
                          </button>
                        )}
                        {request.status === 'accepted' && hasReviewedTeam(request) && (
                          <p className="reviewed-badge">✓ REVIEWED</p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="empty-text">NO OUTGOING REQUESTS</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />

      {reviewModal.isOpen && reviewModal.scrimRequest && (() => {
        const availableTeams = teams;
        const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
        
        // Determine which team is being reviewed (opponent team)
        let targetTeam;
        if (reviewModal.scrimRequest.fromTeamId === selectedTeam) {
          targetTeam = availableTeams.find(t => t.id === reviewModal.scrimRequest.toTeamId);
        } else {
          targetTeam = availableTeams.find(t => t.id === reviewModal.scrimRequest.fromTeamId);
        }
        
        if (!myTeam || !targetTeam) return null;
        
        return (
          <ReviewModal
            isOpen={reviewModal.isOpen}
            onClose={closeReviewModal}
            scrimRequest={reviewModal.scrimRequest}
            myTeam={myTeam}
            targetTeam={targetTeam}
            currentUser={currentUser}
            onReviewSubmitted={handleReviewSubmitted}
          />
        );
      })()}
      
      <PlayerProfileModal
        isOpen={playerProfileModal.isOpen}
        onClose={() => {
          console.log('[FindScrims] Closing modal');
          setPlayerProfileModal({ isOpen: false, player: null, team: null });
        }}
        player={playerProfileModal.player}
        team={playerProfileModal.team}
      />
    </PageWrapper>
  );
};

export default FindScrims;
