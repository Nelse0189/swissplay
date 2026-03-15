import { Link } from 'react-router-dom';
import './About.css';

const About = () => {
  return (
    <div className="about-page">
      <div className="content-wrapper">
        <div className="main-content about-content">
          <h1>About SwissPlay</h1>
          <p className="about-intro">
            SwissPlay is a platform for Overwatch teams to find and schedule scrims. 
            We connect teams of similar skill levels so you can practice against quality opponents.
          </p>

          <section className="about-section">
            <h2>What We Offer</h2>
            <ul>
              <li><strong>Scrim Matching</strong> — Browse teams by tier and availability, request scrims with one click</li>
              <li><strong>Team Management</strong> — Create rosters, track player availability, and coordinate schedules</li>
              <li><strong>Tier Ratings</strong> — Get evaluated and find opponents at your skill level</li>
              <li><strong>Free Agents</strong> — Players looking for teams can list themselves for recruitment</li>
              <li><strong>Ringers</strong> — Find substitute players when your team is short, or list yourself to fill in for teams needing a player</li>
            </ul>
          </section>

          <section className="about-section">
            <h2>How It Works</h2>
            <p>
              Sign in with Discord, create or join a team, and set your availability. 
              Use the scrim finder to browse teams and send requests. When both teams accept, 
              you're matched. It's that simple.
            </p>
          </section>

          <section className="about-section">
            <h2>Get Started</h2>
            <p>
              New to SwissPlay? <Link to="/auth" className="about-link">Sign in</Link> to create your profile, 
              or head to <Link to="/scrims" className="about-link">Find Scrims</Link> to browse available teams.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default About;
