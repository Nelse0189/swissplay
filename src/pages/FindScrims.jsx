import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, updateDoc, doc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import LoadingState from '../components/UI/LoadingState';
import CustomDropdown from '../components/UI/CustomDropdown';
import Modal from '../components/UI/Modal';
import ReviewModal from '../components/UI/ReviewModal';
import PlayerProfileModal from '../components/UI/PlayerProfileModal';
import confetti from 'canvas-confetti';
import './FindScrims.css';

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
const formatSlotTime = (day, hour) => {
  const date = getNextOccurrenceDate(day, hour);
  if (!date) return `${day} ${hour}:00`;
  
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
  
  return `${month}/${dayOfMonth}/${year} ${day} ${hour}:00 ${timeZone}`;
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
const RELIABILITY_DEFAULT = 100;
const getReliabilityTier = (score) => {
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
};

const updateTeamReliability = async (teamId, delta) => {
  if (!teamId) return;
  try {
    await runTransaction(db, async (transaction) => {
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await transaction.get(teamRef);
      const current = teamSnap.exists() ? (teamSnap.data().reliabilityScore ?? RELIABILITY_DEFAULT) : RELIABILITY_DEFAULT;
      const next = Math.max(0, Math.min(100, current + delta));
      transaction.update(teamRef, { reliabilityScore: next });
    });
  } catch (err) {
    console.error('Failed to update team reliability:', err);
  }
};

// Mock Data for Visualization
const MOCK_TEAMS = [
  {
    id: 'mock1',
    name: 'SwissPlay Vanguards',
    region: 'NA',
    sr: 4200,
    faceitDiv: 'Masters',
    reliabilityScore: 92,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-1', name: 'Player One', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Experienced tank player specializing in Reinhardt and Winston.' },
      { uid: 'mock-user-2', name: 'Player Two', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS main with exceptional aim and game sense.' },
      { uid: 'mock-user-3', name: 'Player Three', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support player focused on Ana and Zenyatta.' },
      { uid: 'mock-user-4', name: 'Player Four', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex player comfortable on all roles.' },
      { uid: 'mock-user-5', name: 'Player Five', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Strategic shot-caller and team leader.' }
    ],
    schedule: [
      { day: 'Monday', hour: 20 },
      { day: 'Wednesday', hour: 20 },
      { day: 'Friday', hour: 21 }
    ]
  },
  {
    id: 'mock2',
    name: 'Lunar Eclipse',
    region: 'EU',
    sr: 3800,
    faceitDiv: 'Advanced',
    reliabilityScore: 88,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-6', name: 'Player Six', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Aggressive tank player with strong positioning.' },
      { uid: 'mock-user-7', name: 'Player Seven', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Mechanical DPS player with excellent tracking.' },
      { uid: 'mock-user-8', name: 'Player Eight', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support main specializing in Lucio and Mercy.' },
      { uid: 'mock-user-9', name: 'Player Nine', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex support with strong ult tracking.' },
      { uid: 'mock-user-10', name: 'Player Ten', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Versatile player adapting to team needs.' }
    ],
    schedule: [
      { day: 'Tuesday', hour: 19 },
      { day: 'Thursday', hour: 19 },
      { day: 'Saturday', hour: 18 }
    ]
  },
  {
    id: 'mock3',
    name: 'Starlight Strikers',
    region: 'NA',
    sr: 3000,
    faceitDiv: 'Open',
    reliabilityScore: 78,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-11', name: 'Player Eleven', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Tank specialist with deep game knowledge.' },
      { uid: 'mock-user-12', name: 'Player Twelve', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS player with exceptional positioning.' },
      { uid: 'mock-user-13', name: 'Player Thirteen', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support player focused on team coordination.' },
      { uid: 'mock-user-14', name: 'Player Fourteen', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex player with strong communication.' },
      { uid: 'mock-user-15', name: 'Player Fifteen', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Experienced player across all roles.' }
    ],
    schedule: [
      { day: 'Monday', hour: 20 },
      { day: 'Friday', hour: 20 },
      { day: 'Sunday', hour: 15 }
    ]
  },
  {
    id: 'mock4',
    name: 'Nebula Knights',
    region: 'KR',
    sr: 4500,
    faceitDiv: 'OWCS',
    reliabilityScore: 98,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-16', name: 'Player Sixteen', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Tank main with strong game sense.' },
      { uid: 'mock-user-17', name: 'Player Seventeen', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS specialist with excellent mechanics.' },
      { uid: 'mock-user-18', name: 'Player Eighteen', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support player with strong ult management.' },
      { uid: 'mock-user-19', name: 'Player Nineteen', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex player adapting to meta shifts.' },
      { uid: 'mock-user-20', name: 'Player Twenty', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Versatile player with strong communication.' }
    ],
    schedule: [
      { day: 'Wednesday', hour: 20 },
      { day: 'Thursday', hour: 14 }
    ]
  },
  {
    id: 'mock5',
    name: 'Thunder Bolts',
    region: 'NA',
    sr: 4100,
    faceitDiv: 'Advanced',
    reliabilityScore: 65,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-21', name: 'Player Twenty-One', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Tank player with excellent positioning.' },
      { uid: 'mock-user-22', name: 'Player Twenty-Two', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS main with strong aim and positioning.' },
      { uid: 'mock-user-23', name: 'Player Twenty-Three', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support specialist focused on team play.' },
      { uid: 'mock-user-24', name: 'Player Twenty-Four', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex support with strong game sense.' },
      { uid: 'mock-user-25', name: 'Player Twenty-Five', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Versatile player with deep game knowledge.' }
    ],
    schedule: [
      { day: 'Monday', hour: 20 },
      { day: 'Wednesday', hour: 20 },
      { day: 'Friday', hour: 20 },
      { day: 'Sunday', hour: 19 }
    ]
  },
  {
    id: 'mock6',
    name: 'Shadow Runners',
    region: 'EU',
    sr: 3600,
    faceitDiv: 'Expert',
    reliabilityScore: 72,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-11', name: 'Player Eleven', roles: ['Player'], photoURL: '/default-avatar.png' }
    ],
    schedule: [
      { day: 'Monday', hour: 20 },
      { day: 'Friday', hour: 20 }
    ]
  },
  {
    id: 'mock7',
    name: 'Phoenix Rising',
    region: 'NA',
    sr: 3900,
    faceitDiv: 'Advanced',
    reliabilityScore: 95,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-26', name: 'Player Twenty-Six', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Tank specialist with strong mechanics.' },
      { uid: 'mock-user-27', name: 'Player Twenty-Seven', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS player with excellent positioning.' },
      { uid: 'mock-user-28', name: 'Player Twenty-Eight', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support main focused on team coordination.' },
      { uid: 'mock-user-29', name: 'Player Twenty-Nine', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex player adapting to team needs.' },
      { uid: 'mock-user-30', name: 'Player Thirty', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Experienced player across all roles.' }
    ],
    schedule: [
      { day: 'Wednesday', hour: 20 },
      { day: 'Friday', hour: 20 },
      { day: 'Saturday', hour: 18 }
    ]
  },
  {
    id: 'mock8',
    name: 'Crimson Wolves',
    region: 'NA',
    sr: 3500,
    faceitDiv: 'Open',
    reliabilityScore: 85,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-31', name: 'Player Thirty-One', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Tank main with strong game sense.' },
      { uid: 'mock-user-32', name: 'Player Thirty-Two', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS specialist with excellent mechanics.' },
      { uid: 'mock-user-33', name: 'Player Thirty-Three', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support player with strong ult tracking.' },
      { uid: 'mock-user-34', name: 'Player Thirty-Four', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex support adapting to meta.' },
      { uid: 'mock-user-35', name: 'Player Thirty-Five', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Versatile player with strong communication.' }
    ],
    schedule: [
      { day: 'Monday', hour: 20 },
      { day: 'Wednesday', hour: 20 }
    ]
  },
  {
    id: 'mock9',
    name: 'Frost Giants',
    region: 'EU',
    sr: 4400,
    faceitDiv: 'Masters',
    reliabilityScore: 90,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-36', name: 'Player Thirty-Six', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Tank player with excellent positioning.' },
      { uid: 'mock-user-37', name: 'Player Thirty-Seven', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS main with strong aim and game sense.' },
      { uid: 'mock-user-38', name: 'Player Thirty-Eight', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support specialist focused on team play.' },
      { uid: 'mock-user-39', name: 'Player Thirty-Nine', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex player with deep game knowledge.' },
      { uid: 'mock-user-40', name: 'Player Forty', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Experienced player across all roles.' }
    ],
    schedule: [
      { day: 'Friday', hour: 20 },
      { day: 'Sunday', hour: 20 }
    ]
  },
  {
    id: 'mock10',
    name: 'Void Seekers',
    region: 'NA',
    sr: 3200,
    faceitDiv: 'Expert',
    reliabilityScore: 82,
    photoURL: '/default-team.svg',
    members: [
      { uid: 'mock-user-41', name: 'Player Forty-One', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Tank specialist with strong mechanics.' },
      { uid: 'mock-user-42', name: 'Player Forty-Two', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'DPS player with excellent positioning.' },
      { uid: 'mock-user-43', name: 'Player Forty-Three', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Support main with strong ult management.' },
      { uid: 'mock-user-44', name: 'Player Forty-Four', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Flex support adapting to team needs.' },
      { uid: 'mock-user-45', name: 'Player Forty-Five', roles: ['Player'], photoURL: '/default-avatar.png', bio: 'Versatile player with strong communication.' }
    ],
    schedule: [
      { day: 'Monday', hour: 20 },
      { day: 'Wednesday', hour: 20 },
      { day: 'Friday', hour: 20 }
    ]
  }
];

// Helper function to get a past date for mock data
const getPastScrimDate = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return {
    day: daysOfWeek[date.getDay()],
    hour: 20,
    // Store the actual date for comparison
    actualDate: new Date(date.setHours(20, 0, 0, 0))
  };
};

const MOCK_REQUESTS = [
  {
    id: 'req1',
    fromTeamName: 'SwissPlay Vanguards',
    toTeamName: 'My Team',
    slot: { day: 'Monday', hour: 20 },
    status: 'pending'
  },
  {
    id: 'req2',
    fromTeamName: 'Thunder Bolts',
    toTeamName: 'My Team',
    slot: { day: 'Wednesday', hour: 20 },
    status: 'pending'
  },
  {
    id: 'req3',
    fromTeamName: 'Shadow Runners',
    toTeamName: 'My Team',
    slot: { day: 'Friday', hour: 20 },
    status: 'pending'
  },
  {
    id: 'req4',
    fromTeamName: 'My Team',
    toTeamName: 'Starlight Strikers',
    slot: getPastScrimDate(7), // Last week's Monday
    status: 'accepted',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  },
  {
    id: 'req5',
    fromTeamName: 'My Team',
    toTeamName: 'Phoenix Rising',
    slot: { day: 'Wednesday', hour: 20 },
    status: 'pending'
  },
  {
    id: 'req6',
    fromTeamName: 'My Team',
    toTeamName: 'Void Seekers',
    slot: getPastScrimDate(3), // 3 days ago
    status: 'accepted',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  }
];

const FindScrims = () => {
  const [teams, setTeams] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scrimRequests, setScrimRequests] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [useMockData, setUseMockData] = useState(true); // Default to true for visualization

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

  // Reload when mock data toggle changes
  useEffect(() => {
    if (currentUser) {
      // Reset selectedTeam when toggling mock data to avoid stale references
      setSelectedTeam(null);
      // Clear existing data first
      setTeams([]);
      setUserTeams([]);
      setScrimRequests([]);
      // Then load new data
      loadTeams();
      loadUserTeams();
      loadScrimRequests();
    }
  }, [useMockData, currentUser]);

  // Load reviews when selectedTeam changes
  useEffect(() => {
    if (selectedTeam && currentUser) {
      loadReviews();
    }
  }, [selectedTeam, currentUser]);

  const loadTeams = async () => {
    try {
      if (useMockData) {
        setTeams(MOCK_TEAMS);
      } else {
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        const teamsData = teamsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTeams(teamsData);
      }
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
      if (useMockData) {
        // Create a mock user team for visualization
        const mockUserTeam = {
          id: 'my-team-mock',
          name: 'My Team',
          region: 'NA',
          sr: 4000,
          faceitDiv: 'Advanced',
          photoURL: '/default-team.svg',
          schedule: [
            { day: 'Monday', hour: 20 },
            { day: 'Wednesday', hour: 20 },
            { day: 'Friday', hour: 20 }
          ],
          members: [{ 
            uid: currentUser.uid, 
            name: currentUser.email?.split('@')[0] || 'User',
            roles: ['Manager'],
            photoURL: currentUser.photoURL || '/default-avatar.png'
          }]
        };
        setUserTeams([mockUserTeam]);
        // Only set selectedTeam if it's not already set or if it was the mock team
        setSelectedTeam(prev => prev === null || prev === 'my-team-mock' ? mockUserTeam.id : prev);
        setLoading(false);
      } else {
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        const teamsData = teamsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(t => t.members && t.members.some(m => m.uid === currentUser.uid));
          
        setUserTeams(teamsData);
        // Only set selectedTeam if we have teams and it's not already a valid team
        if (teamsData.length > 0) {
          setSelectedTeam(prev => {
            // If current selection is mock team or doesn't exist in real teams, select first real team
            if (prev === 'my-team-mock' || !teamsData.find(t => t.id === prev)) {
              return teamsData[0].id;
            }
            return prev;
          });
        } else {
          setSelectedTeam(null);
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading user teams:', error);
      setLoading(false);
    }
  };

  const loadScrimRequests = async () => {
    if (!currentUser) return;
    try {
      if (useMockData) {
        setScrimRequests(MOCK_REQUESTS);
      } else {
        const requestsSnapshot = await getDocs(collection(db, 'scrimRequests'));
        const requestsData = requestsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setScrimRequests(requestsData);
      }
      // Load reviews to check if user has already reviewed
      await loadReviews();
    } catch (error) {
      console.error('Error loading scrim requests:', error);
    }
  };

  const loadReviews = async () => {
    if (!selectedTeam || !currentUser) return;
    try {
      if (useMockData) {
        // Mock reviews - empty for now, will be populated when reviews are submitted
        setReviews([]);
      } else {
        const reviewsSnapshot = await getDocs(
          query(collection(db, 'teamReviews'), where('fromTeamId', '==', selectedTeam))
        );
        const reviewsData = reviewsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setReviews(reviewsData);
      }
    } catch (error) {
      console.error('Error loading reviews:', error);
    }
  };

  const handleReviewSubmitted = async (reviewData) => {
    // Add review to local state for immediate UI update
    if (useMockData) {
      setReviews(prev => [...prev, reviewData]);
    } else {
      await loadReviews(); // Reload to ensure consistency
    }
    showModal('Review Submitted', 'Thank you for your review!', 'success');
  };

  const findMatchingTeams = () => {
    if (!selectedTeam) return [];

    // Use MOCK_TEAMS directly if mock data is enabled to ensure data availability
    const availableTeams = useMockData ? MOCK_TEAMS : teams;

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

    // Rank (SR): closer = better (within 500 = good)
    const mySr = myTeam.sr ?? 3000;
    const theirSr = otherTeam.sr ?? 3000;
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
    // Use MOCK_TEAMS directly if mock data is enabled
    const availableTeams = useMockData ? MOCK_TEAMS : teams;

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

    const availableTeams = useMockData ? MOCK_TEAMS : teams;
    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
    const targetTeam = availableTeams.find(t => t.id === targetTeamId);

    if (!myTeam || !targetTeam) return null;

    const request = scrimRequests.find(req => {
      if (useMockData) {
        return (
          ((req.fromTeamName === myTeam.name && req.toTeamName === targetTeam.name) ||
           (req.fromTeamName === targetTeam.name && req.toTeamName === myTeam.name)) &&
          req.slot.day === slot.day &&
          req.slot.hour === slot.hour
        );
      } else {
        return (
          ((req.fromTeamId === selectedTeam && req.toTeamId === targetTeamId) ||
           (req.fromTeamId === targetTeamId && req.toTeamId === selectedTeam)) &&
          req.slot.day === slot.day &&
          req.slot.hour === slot.hour
        );
      }
    });

    return request ? request.status : null;
  };

  // Autolock: team is locked at slot if they have pending/accepted scrim (with anyone)
  const isSlotLockedForTeam = (teamId, teamName, slot) => {
    return scrimRequests.some(req => {
      const matchesSlot = req.slot?.day === slot.day && req.slot?.hour === slot.hour;
      const isActive = req.status === 'pending' || req.status === 'accepted';
      if (!matchesSlot || !isActive) return false;
      if (useMockData) {
        return req.fromTeamName === teamName || req.toTeamName === teamName;
      }
      return req.fromTeamId === teamId || req.toTeamId === teamId;
    });
  };

  const isSlotLockedForMyTeam = (slot) => {
    if (!selectedTeam) return false;
    const availableTeams = useMockData ? MOCK_TEAMS : teams;
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
    const availableTeams = useMockData ? MOCK_TEAMS : teams;
    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
    const targetTeam = availableTeams.find(t => t.id === targetTeamId);

    if (!myTeam || !targetTeam) {
      showModal('Team Not Found', 'Team information not found.', 'error');
      return;
    }

    // Check if request already exists for this slot
    const existingRequest = scrimRequests.find(req => {
      if (useMockData) {
        return (
          ((req.fromTeamName === myTeam.name && req.toTeamName === targetTeam.name) ||
           (req.fromTeamName === targetTeam.name && req.toTeamName === myTeam.name)) &&
          req.slot.day === slot.day &&
          req.slot.hour === slot.hour &&
          req.status !== 'rejected'
        );
      } else {
        return (
          ((req.fromTeamId === selectedTeam && req.toTeamId === targetTeamId) ||
           (req.fromTeamId === targetTeamId && req.toTeamId === selectedTeam)) &&
          req.slot.day === slot.day &&
          req.slot.hour === slot.hour &&
          req.status !== 'rejected'
        );
      }
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
      
      if (useMockData) {
        // Add to mock requests
        const newRequest = {
          id: `req-${Date.now()}`,
          fromTeamName: myTeam.name,
          toTeamName: targetTeam.name,
          slot: { day: slot.day, hour: slot.hour, scheduledDate: scrimDate },
          status: 'pending',
          createdAt: new Date()
        };
        setScrimRequests(prev => [...prev, newRequest]);
        showModal(
          'Request Sent',
          `Scrim request sent to ${targetTeam.name} for ${formatSlotTime(slot.day, slot.hour)}!`,
          'success'
        );
      } else {
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

        await addDoc(collection(db, 'scrimRequests'), requestData);
        await loadScrimRequests(); // Reload to show the new request
        showModal(
          'Request Sent',
          `Scrim request sent to ${targetTeam.name} for ${formatSlotTime(slot.day, slot.hour)}!`,
          'success'
        );
      }
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

    if (useMockData) {
      setScrimRequests(prev =>
        prev.map(req =>
          req.id === requestId ? { ...req, status, respondedAt } : req
        )
      );
    } else {
      try {
        await updateDoc(doc(db, 'scrimRequests', requestId), {
          status,
          respondedAt,
        });
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
      const confirmMessage = `Cancel scrim request with ${request.toTeamName} on ${formatSlotTime(request.slot.day, request.slot.hour)}?`;
      shouldProceed = window.confirm(confirmMessage);
      
      if (!shouldProceed) {
        return;
      }
    }
    
    try {
      if (useMockData) {
        // Remove from mock data
        setScrimRequests(prev => prev.filter(req => req.id !== request.id));
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
      } else {
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

    if (useMockData) {
      setScrimRequests(prev =>
        prev.map(req =>
          req.id === request.id
            ? { ...req, noShowReportedBy: selectedTeam, noShowReportedAt: new Date() }
            : req
        )
      );
      showModal('No-Show Reported', `${noShowTeamName} has been reported. Their reliability score has been reduced.`, 'success');
    } else {
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
    }
  };

  const openReviewModal = (request) => {
    setReviewModal({ isOpen: true, scrimRequest: request });
  };

  const closeReviewModal = () => {
    setReviewModal({ isOpen: false, scrimRequest: null });
  };

  // Check if a scrim slot has already passed
  const isScrimInPast = (slot, requestCreatedAt) => {
    if (!slot || !slot.day || slot.hour === undefined) return false;

    // If the request has an actualDate (from mock data), use it directly
    if (slot.actualDate) {
      return new Date(slot.actualDate) < new Date();
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
      }
      
      // Get the date of the slot
      const slotDate = new Date(createdAt);
      slotDate.setDate(createdAt.getDate() + daysUntilSlot);
      slotDate.setHours(slot.hour, 0, 0, 0);
      
      // If this slot date is in the past, return true
      return slotDate < now;
    }

    // Fallback: Find the most recent occurrence of this day/hour
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    // Calculate days until next occurrence
    let daysUntilSlot = slotDayIndex - currentDay;
    if (daysUntilSlot < 0) {
      daysUntilSlot += 7; // Next week
    }
    
    const slotDate = new Date(now);
    slotDate.setDate(now.getDate() + daysUntilSlot);
    slotDate.setHours(slot.hour, 0, 0, 0);

    // If it's today, check if the hour has passed
    if (daysUntilSlot === 0) {
      return slot.hour < currentHour;
    }
    
    // If daysUntilSlot > 0, the next occurrence is in the future
    // Check the previous week's occurrence
    slotDate.setDate(slotDate.getDate() - 7);
    return slotDate < now;
  };

  const hasReviewedTeam = (request) => {
    if (!request || !selectedTeam) return false;
    
    // Determine which team is being reviewed
    let targetTeamId;
    if (useMockData) {
      // For mock data, check team names
      const myTeam = userTeams.find(t => t.id === selectedTeam);
      const myTeamName = myTeam?.name || 'My Team';
      if (request.fromTeamName === myTeamName) {
        targetTeamId = request.toTeamName;
      } else {
        targetTeamId = request.fromTeamName;
      }
    } else {
      // For real data, check team IDs
      if (request.fromTeamId === selectedTeam) {
        targetTeamId = request.toTeamId;
      } else {
        targetTeamId = request.fromTeamId;
      }
    }
    
    // Check if review exists for this team and scrim request
    return reviews.some(r => r.teamId === targetTeamId && r.scrimRequestId === request.id);
  };

  const rawMatchingTeams = findMatchingTeams();
  const availableTeamsForScore = useMockData ? MOCK_TEAMS : teams;
  const myTeamForScore = availableTeamsForScore.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
  const matchingTeams = myTeamForScore
    ? rawMatchingTeams
      .map(team => ({ team, matchScore: getMatchScore(myTeamForScore, team) }))
      .sort((a, b) => (b.matchScore - a.matchScore))
      .map(({ team, matchScore }) => ({ ...team, matchScore }))
    : rawMatchingTeams;
  const incomingRequests = scrimRequests.filter(r => {
    if (useMockData) {
      return r.status === 'pending' && r.toTeamName === 'My Team';
    }
    return r.toTeamId === selectedTeam && r.status === 'pending';
  });
  const myRequests = scrimRequests.filter(r => {
    if (useMockData) {
      return r.fromTeamName === 'My Team';
    }
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
        <div className="mock-toggle">
          <button 
            onClick={() => setUseMockData(!useMockData)}
            className="request-btn-small"
            style={{ background: useMockData ? '#4caf50' : '#333' }}
          >
            {useMockData ? 'MOCK DATA: ON' : 'MOCK DATA: OFF'}
          </button>
        </div>
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
                              <span>SR: {team.sr || 'N/A'}</span>
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
                        <span className="badge">{team.faceitDiv || 'OPEN'}</span>
                        {team.matchScore >= 75 && (
                          <span className="badge suggested-badge" title={`Match score: ${team.matchScore}% — similar reliability, rank, schedule & region`}>
                            SUGGESTED
                          </span>
                        )}
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
                    const availableTeams = useMockData ? MOCK_TEAMS : teams;
                    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
                    const targetTeam = availableTeams.find(t => 
                      useMockData ? t.name === request.fromTeamName : t.id === request.fromTeamId
                    );
                    const canReview = request.status === 'accepted' && 
                                      !hasReviewedTeam(request) && 
                                      isScrimInPast(request.slot, request.createdAt);
                    const canReportNoShow = request.status === 'accepted' &&
                                      isScrimInPast(request.slot, request.createdAt) &&
                                      !request.noShowReportedBy;
                    
                    return (
                      <div key={request.id} className="request-card incoming">
                        <p><strong>{request.fromTeamName}</strong></p>
                        <p className="request-time">{formatSlotTime(request.slot.day, request.slot.hour)}</p>
                        {request.status === 'pending' ? (
                          <div className="request-actions">
                            <button
                              onClick={() => updateRequestStatus(request.id, 'accepted')}
                              className="accept-btn"
                            >
                              ACCEPT
                            </button>
                            <button
                              onClick={() => updateRequestStatus(request.id, 'rejected')}
                              className="reject-btn"
                            >
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
                    const availableTeams = useMockData ? MOCK_TEAMS : teams;
                    const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
                    const targetTeam = availableTeams.find(t => 
                      useMockData ? t.name === request.toTeamName : t.id === request.toTeamId
                    );
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
                        <p className="request-time">{formatSlotTime(request.slot.day, request.slot.hour)}</p>
                        <p className={`status-text status-${request.status}`}>{request.status.toUpperCase()}</p>
                        {canCancel && (
                          <button
                            onClick={() => cancelScrimRequest(request)}
                            className={`cancel-btn ${isWithinPenaltyWindow ? 'penalty-warning' : ''}`}
                          >
                            {isWithinPenaltyWindow ? '⚠ CANCEL (PENALTY)' : 'CANCEL'}
                          </button>
                        )}
                        {canReportNoShow && (
                          <button
                            onClick={() => reportNoShow(request)}
                            className="no-show-btn"
                            title="Report if they didn't show up"
                          >
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
        const availableTeams = useMockData ? MOCK_TEAMS : teams;
        const myTeam = availableTeams.find(t => t.id === selectedTeam) || userTeams.find(t => t.id === selectedTeam);
        
        // Determine which team is being reviewed (opponent team)
        let targetTeam;
        if (useMockData) {
          const myTeamName = myTeam?.name || 'My Team';
          if (reviewModal.scrimRequest.fromTeamName === myTeamName) {
            targetTeam = availableTeams.find(t => t.name === reviewModal.scrimRequest.toTeamName);
          } else {
            targetTeam = availableTeams.find(t => t.name === reviewModal.scrimRequest.fromTeamName);
          }
        } else {
          if (reviewModal.scrimRequest.fromTeamId === selectedTeam) {
            targetTeam = availableTeams.find(t => t.id === reviewModal.scrimRequest.toTeamId);
          } else {
            targetTeam = availableTeams.find(t => t.id === reviewModal.scrimRequest.fromTeamId);
          }
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
            useMockData={useMockData}
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
        useMockData={useMockData}
      />
    </PageWrapper>
  );
};

export default FindScrims;
