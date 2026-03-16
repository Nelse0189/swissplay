import { Link } from 'react-router-dom';
import './FAQ.css';

const DISCORD_SERVER = 'https://discord.gg/rFUX24TeXc';
const DISCORD_BOT_INVITE = 'https://discord.com/oauth2/authorize?client_id=1445440806797185129&permissions=84672&scope=bot%20applications.commands';

const FAQ = () => {
  const faqItems = [
    {
      question: 'How do I create a team?',
      answer: (
        <>
          Go to the <Link to="/teams/create" className="faq-link">Create a team</Link> page. Fill in your team details including name, region, SR, and division.
        </>
      )
    },
    {
      question: 'How do I invite players to my team?',
      answer: (
        <>
          Inviting players is done through the <a href={DISCORD_BOT_INVITE} target="_blank" rel="noopener noreferrer" className="faq-link">SwissPlay Discord bot</a>. First, players need to confirm their Discord account: they must{' '}
          <a href={DISCORD_SERVER} target="_blank" rel="noopener noreferrer" className="faq-link">join the SwissPlay Discord server</a>, then fill in the Discord linking form (in <Link to="/profile" className="faq-link">Profile</Link> or <Link to="/teams/overwatch" className="faq-link">Team Management → Settings</Link>) with their Discord username. The bot will send them a DM to confirm. Once confirmed, add the bot to your team&apos;s Discord server using the link above, then use the <code>/add-player</code> command to add them to your roster.
        </>
      )
    },
    {
      question: 'What is a Tier Rating?',
      answer: 'Tier Rating is a skill assessment system that categorizes players into tiers (Bronze through Grandmaster) based on their competitive performance and skill rating.'
    },
    {
      question: 'How do I request a skill revaluation?',
      answer: (
        <>
          Go to <Link to="/profile/revaluation" className="faq-link">Request a skill revaluation</Link>. Fill out the form with your current SR, expected SR, and reason for revaluation. Our team will review your request.
        </>
      )
    },
    {
      question: 'How do I find scrims?',
      answer: (
        <>
          Navigate to <Link to="/scrims" className="faq-link">Find Scrims</Link>, select your team, and browse available teams that match your schedule. You can send scrim requests to teams with matching availability.
        </>
      )
    },
    {
      question: 'How do I link my Discord account?',
      answer: (
        <>
          First, <a href={DISCORD_SERVER} target="_blank" rel="noopener noreferrer" className="faq-link">join the SwissPlay Discord server</a>. After joining, go to the Discord linking form in <Link to="/profile" className="faq-link">Profile</Link> or <Link to="/teams/overwatch" className="faq-link">Team Management → Settings</Link> and enter your Discord username. The SwissPlay bot will send you a DM—click the confirmation button to complete the link.
        </>
      )
    }
  ];

  return (
    <div className="faq-page">
      <div className="content-wrapper">
        <div className="main-content faq-content">
          <h1>Frequently Asked Questions</h1>
          <p className="faq-intro">
            Quick answers to common questions about SwissPlay. Need more help? Visit our{' '}
            <Link to="/help" className="faq-link">Help Center</Link> or{' '}
            <Link to="/contact" className="faq-link">Contact Us</Link>.
          </p>

          <div className="faq-list">
            {faqItems.map((item, index) => (
              <div key={index} className="faq-item">
                <h3 className="faq-question">{item.question}</h3>
                <p className="faq-answer">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
