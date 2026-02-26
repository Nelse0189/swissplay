import React from 'react';
import { useNavigate } from 'react-router-dom';
import './About.css'; // Reuse about styles for consistent look

const ScrimLogGuide = () => {
  const navigate = useNavigate();

  return (
    <div className="about-page">
      <div className="content-wrapper">
        <div className="about-content">
          <div className="about-header">
            <h1>SCRIMTIME GUIDE</h1>
            <button className="save-btn" onClick={() => navigate(-1)}>
              BACK
            </button>
          </div>

          <section className="about-section">
            <h2>USING THE SCRIM CODE</h2>
            <p>
              To track your team's performance and upload detailed statistics to Solaris, 
              we recommend using the <strong>ScrimTime</strong> workshop mode.
            </p>
            
            <div className="info-card" style={{ marginTop: '2rem', padding: '2rem' }}>
              <h3 style={{ color: 'var(--color-accent)', marginBottom: '1rem' }}>WORKSHOP CODE: 9GPA9</h3>
              <p>This version of ScrimTime has log files enabled by default.</p>
            </div>
          </section>

          <section className="about-section">
            <h2>HOW TO EXPORT LOGS</h2>
            <ol style={{ color: 'var(--color-text)', lineHeight: '2' }}>
              <li>Host a custom game using the code <strong>9GPA9</strong>.</li>
              <li>Complete your scrim or match rounds.</li>
              <li>When the match finishes, Overwatch will generate a CSV log if you have the "Enable Inspector Log" setting on (enabled by default in this code).</li>
              <li>Open the Overwatch Inspector (Esc {'>'} Workshop Inspector).</li>
              <li>Copy the log data or export it as a CSV file.</li>
              <li>Upload the CSV file directly to your Team Dashboard on Solaris or send it to the SwissPlay Discord bot.</li>
            </ol>
          </section>

          <section className="about-section">
            <h2>WHY USE SCRIMTIME?</h2>
            <p>
              ScrimTime provides deep insights into your team's play, including:
            </p>
            <ul style={{ color: 'var(--color-text)', marginTop: '1rem', listStyle: 'none' }}>
              <li>✓ Map-specific performance metrics</li>
              <li>✓ Individual player hero statistics</li>
              <li>✓ Ultimate usage and efficiency tracking</li>
              <li>✓ Kill/Death analysis and positioning data</li>
            </ul>
          </section>

          <div className="about-footer" style={{ marginTop: '3rem', textAlign: 'center' }}>
            <button className="save-btn" onClick={() => navigate('/team-management')}>
              GO TO TEAM DASHBOARD
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScrimLogGuide;


