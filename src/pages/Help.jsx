import { useNavigate } from 'react-router-dom';
import './Help.css';

const Help = () => {
  const navigate = useNavigate();

  const faqItems = [
    {
      question: 'How do I create a team?',
      answer: 'Navigate to Teams → Create a team, or go directly to the Team Management page. Fill in your team details including name, region, SR, and division.'
    },
    {
      question: 'How do I invite players to my team?',
      answer: 'Go to Team Management → Settings → Invite Operatives. Enter the Discord username of the player you want to invite. They will receive a DM and be added to your roster when they accept.'
    },
    {
      question: 'What is a Tier Rating?',
      answer: 'Tier Rating is a skill assessment system that categorizes players into tiers (Bronze through Grandmaster) based on their competitive performance and skill rating.'
    },
    {
      question: 'How do I request a skill revaluation?',
      answer: 'Go to Profile → Request a skill revaluation. Fill out the form with your current SR, expected SR, and reason for revaluation. Our team will review your request.'
    },
    {
      question: 'How do I find scrims?',
      answer: 'Navigate to Find Scrims, select your team, and browse available teams that match your schedule. You can send scrim requests to teams with matching availability.'
    },
    {
      question: 'How do I link my Discord account?',
      answer: 'Go to Team Management → Settings → Link Your Discord Account. Enter your Discord username and confirm the DM sent by the bot.'
    },
    {
      question: 'How do I invite the Discord bot to my server?',
      answer: 'Go to Team Management → Settings → Discord Bot Setup. Click "INVITE BOT TO DISCORD SERVER" and authorize the bot in your Discord server. You need server administrator permissions to invite the bot.'
    },
    {
      question: 'How do I track scrim performance with ScrimTime?',
      answer: 'Use Overwatch workshop code 9GPA9 for your scrims. After the match, export the CSV log from the Workshop Inspector and upload it to Team Management → Scrim Logs. You can also send the file to the SwissPlay Discord bot.'
    }
  ];

  return (
    <div className="help-page">
      <div className="content-wrapper">
        <div className="help-content">
          <div className="help-header">
            <h1>HELP CENTER</h1>
            <button className="save-btn" onClick={() => navigate('/contact')}>
              CONTACT SUPPORT
            </button>
          </div>

          <div className="help-sections">
            <div className="help-section">
              <h2>FREQUENTLY ASKED QUESTIONS</h2>
              <div className="faq-list">
                {faqItems.map((item, index) => (
                  <div key={index} className="faq-item">
                    <h3 className="faq-question">{item.question}</h3>
                    <p className="faq-answer">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="help-section">
              <h2>QUICK LINKS</h2>
              <div className="quick-links">
                <button className="link-card" onClick={() => navigate('/teams/overwatch')}>
                  <h3>Team Management</h3>
                  <p>Create and manage your teams</p>
                </button>
                <button className="link-card" onClick={() => navigate('/scrims')}>
                  <h3>Find Scrims</h3>
                  <p>Discover teams to practice with</p>
                </button>
                <button className="link-card" onClick={() => navigate('/profile')}>
                  <h3>My Profile</h3>
                  <p>View your profile and ratings</p>
                </button>
                <button className="link-card" onClick={() => navigate('/profile/tier-rating')}>
                  <h3>Tier Rating</h3>
                  <p>Check your skill tier</p>
                </button>
              </div>
            </div>

            <div className="help-section">
              <h2>GETTING STARTED</h2>
              <div className="getting-started">
                <div className="step-item">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3>Create an Account</h3>
                    <p>Sign up or sign in to get started</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3>Create or Join a Team</h3>
                    <p>Set up your team or join an existing one</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3>Invite Discord Bot (Managers)</h3>
                    <p>If you're a manager, invite the Swiss Play Discord bot to your Discord server to enable team features</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h3>Link Your Discord</h3>
                    <p>Connect your Discord account for team features</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-number">5</div>
                  <div className="step-content">
                    <h3>Set Your Availability</h3>
                    <p>Let teams know when you're available to scrim</p>
                  </div>
                </div>
            </div>
          </div>

          <div className="help-section">
            <h2>DISCORD BOT SETUP</h2>
            <div className="bot-setup-info">
              <p>
                To use team invitation features, managers need to invite the Swiss Play Discord bot to their Discord server.
              </p>
              <div className="bot-install-card">
                <h3>Invite the Bot</h3>
                <p>Click the button below to invite the Swiss Play Discord bot to your server. The bot will enable:</p>
                <ul className="bot-features">
                  <li>Team member invitations via Discord</li>
                  <li>Direct message notifications</li>
                  <li>Team management commands</li>
                  <li>Scrim coordination features</li>
                </ul>
                <a 
                  href="https://discord.com/oauth2/authorize?client_id=1445440806797185129" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="save-btn"
                  style={{ 
                    display: 'inline-block',
                    textDecoration: 'none',
                    textAlign: 'center',
                    marginTop: '1rem'
                  }}
                >
                  INVITE BOT TO DISCORD SERVER
                </a>
                <p style={{ color: 'var(--color-text-secondary, rgba(255, 255, 255, 0.6))', margin: '1rem 0 0 0', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  You must be a server administrator or have "Manage Server" permissions to invite the bot.
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;

