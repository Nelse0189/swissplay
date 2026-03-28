import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { auth } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import DigitalOverlay from '../components/DigitalOverlay';
import './Home.css';

const DISCORD_INVITE = 'https://discord.gg/rFUX24TeXc';

const Home = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="home-page">
      <DigitalOverlay />
      <div className="content-wrapper">
        <div className="home-hero">
          <h1 className="home-hero__title">Find Your Next Scrim</h1>
          <p className="home-hero__tagline">
            Connect with Overwatch teams, schedule matches, and grow your competitive edge.
          </p>
          <div className="home-hero__ctas">
            <Link to="/scrims" className="home-hero__btn home-hero__btn--primary">
              Find Scrims
            </Link>
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="home-hero__btn home-hero__btn--secondary"
            >
              Join Discord
            </a>
            {!user && (
              <Link to="/auth" className="home-hero__btn home-hero__btn--secondary">
                Sign In
              </Link>
            )}
          </div>
        </div>
        <div className="home-features">
          <div className="home-feature home-feature--scrim">
            <div className="home-feature__icon home-feature__icon--scrim" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="22" y1="12" x2="18" y2="12"></line>
                <line x1="6" y1="12" x2="2" y2="12"></line>
                <line x1="12" y1="6" x2="12" y2="2"></line>
                <line x1="12" y1="22" x2="12" y2="18"></line>
              </svg>
            </div>
            <span className="home-feature__label">Scrim Matching</span>
            <p>Browse teams by tier and availability. Request scrims with one click.</p>
          </div>
          <div className="home-feature home-feature--team">
            <div className="home-feature__icon home-feature__icon--team" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <span className="home-feature__label">Team Management</span>
            <p>Create rosters, track availability, and coordinate with your squad.</p>
          </div>
          <div className="home-feature home-feature--tier">
            <div className="home-feature__icon home-feature__icon--tier" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="7"></circle>
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
              </svg>
            </div>
            <span className="home-feature__label">Tier Ratings</span>
            <p>Get evaluated and find opponents at your skill level.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
