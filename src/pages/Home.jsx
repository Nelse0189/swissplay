import { Link } from 'react-router-dom';
import DigitalOverlay from '../components/DigitalOverlay';
import './Home.css';

const Home = () => {
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
            <Link to="/auth" className="home-hero__btn home-hero__btn--secondary">
              Sign In
            </Link>
          </div>
        </div>
        <div className="home-features">
          <div className="home-feature">
            <span className="home-feature__label">Scrim Matching</span>
            <p>Browse teams by tier and availability. Request scrims with one click.</p>
          </div>
          <div className="home-feature">
            <span className="home-feature__label">Team Management</span>
            <p>Create rosters, track availability, and coordinate with your squad.</p>
          </div>
          <div className="home-feature">
            <span className="home-feature__label">Tier Ratings</span>
            <p>Get evaluated and find opponents at your skill level.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
