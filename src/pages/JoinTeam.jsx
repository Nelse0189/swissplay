import { useNavigate } from 'react-router-dom';
import './JoinTeam.css';

const JoinTeam = () => {
  const navigate = useNavigate();

  return (
    <div className="join-team-page">
      <div className="content-wrapper">
        <div className="join-team-content">
          <div className="join-team-header">
            <h1>JOIN A TEAM</h1>
            <button className="save-btn" onClick={() => navigate('/teams/overwatch')}>
              BACK TO TEAMS
            </button>
          </div>

          <div className="join-team-card">
            <div className="info-section">
              <div className="info-icon">📬</div>
              <h2>TEAM INVITATIONS</h2>
              <p className="main-message">
                In order to join a team, a manager must invite you via the Swiss Play Discord bot.
              </p>
            </div>

            <div className="instructions-section">
              <h3>HOW IT WORKS</h3>
              <div className="steps-list">
                <div className="step-item">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>GET INVITED</h4>
                    <p>A team manager will send you an invitation through the Swiss Play Discord bot using your Discord username.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>RECEIVE DM</h4>
                    <p>You'll receive a direct message from the bot with a team invitation.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>ACCEPT INVITATION</h4>
                    <p>Click "✅ Confirm" in the Discord DM to accept the invitation and join the team roster.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h4>ACCESS YOUR TEAM</h4>
                    <p>Once accepted, you'll be able to access your team's dashboard and features.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="note-section">
              <h3>IMPORTANT NOTES</h3>
              <ul className="notes-list">
                <li>You must have a Discord account to receive team invitations</li>
                <li>Make sure you're in a Discord server where the Swiss Play bot is present</li>
                <li>Team managers can invite you by entering your Discord username in the Team Management settings</li>
                <li>If you haven't received an invitation, contact a team manager directly</li>
              </ul>
            </div>

            <div className="actions-section">
              <button className="save-btn secondary" onClick={() => navigate('/help')}>
                VIEW HELP CENTER
              </button>
              <button className="save-btn" onClick={() => navigate('/teams/overwatch')}>
                CREATE A TEAM INSTEAD
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinTeam;


