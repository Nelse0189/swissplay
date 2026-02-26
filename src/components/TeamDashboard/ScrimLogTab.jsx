import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { parseScrimTimeCSV, isValidScrimTimeCSV } from '../../utils/scrimParser';
import './TeamDashboard.css';

const ScrimLogTab = ({ team, currentUser }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [parsedData, setParsedData] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError(null);
    setSuccess(null);
    setParsedData(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      
      if (!isValidScrimTimeCSV(content)) {
        setError("Invalid ScrimTime CSV format. Please make sure you are using the correct workshop code (9GPA9).");
        return;
      }

      try {
        const data = parseScrimTimeCSV(content);
        setParsedData(data);
      } catch (err) {
        console.error("Parsing error:", err);
        setError("Failed to parse CSV file.");
      }
    };
    reader.readAsText(file);
  };

  const saveScrimData = async () => {
    if (!parsedData || !team) return;

    setUploading(true);
    try {
      // Save to Firestore
      const scrimLogsRef = collection(db, 'scrimLogs');
      await addDoc(scrimLogsRef, {
        teamId: team.id,
        uploadedBy: currentUser.uid,
        uploadedAt: new Date(),
        matchMetadata: parsedData.metadata,
        playerStats: parsedData.players,
        teamStats: parsedData.teams,
        killLog: parsedData.kills,
        ultimateLog: parsedData.ultimates,
        roundStats: parsedData.rounds
      });

      setSuccess("Scrim data successfully uploaded and saved!");
      setParsedData(null);
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save scrim data to database.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="scrim-log-tab">
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>SCRIM DATA PARSER</h3>
          <Link to="/scrim-guide" className="save-btn secondary" style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem' }}>
            VIEW GUIDE
          </Link>
        </div>
        <p className="section-desc">
          Upload your ScrimTime CSV logs to track performance and detailed statistics.
          Don't have a log? Use workshop code <strong>9GPA9</strong> in your next scrim.
        </p>

        <div className="upload-container" style={{ marginTop: '2rem', padding: '2rem', border: '2px dashed var(--color-border)', borderRadius: '8px', textAlign: 'center' }}>
          <input
            type="file"
            id="scrim-csv-upload"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <label htmlFor="scrim-csv-upload" className="save-btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
            SELECT CSV FILE
          </label>
          <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            Accepted formats: .csv, .txt (from Overwatch Inspector)
          </p>
        </div>

        {error && (
          <div className="error-message" style={{ marginTop: '1rem', color: '#ff4444', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {success && (
          <div className="success-message" style={{ marginTop: '1rem', color: '#4caf50', textAlign: 'center' }}>
            {success}
          </div>
        )}

        {parsedData && (
          <div className="parsed-preview" style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <h4>MATCH PREVIEW</h4>
            <div className="preview-details" style={{ marginTop: '1rem' }}>
              <p><strong>Map:</strong> {parsedData.metadata?.mapName || 'Unknown'}</p>
              <p><strong>Teams:</strong> {parsedData.metadata?.team1Name} vs {parsedData.metadata?.team2Name}</p>
              <p><strong>Score:</strong> {parsedData.metadata?.score1} - {parsedData.metadata?.score2}</p>
              <p><strong>Players Tracked:</strong> {parsedData.players.length}</p>
            </div>
            
            <button 
              className="save-btn" 
              onClick={saveScrimData} 
              disabled={uploading}
              style={{ marginTop: '1.5rem', width: '100%' }}
            >
              {uploading ? 'SAVING...' : 'CONFIRM AND SAVE SCRIM DATA'}
            </button>
          </div>
        )}
      </div>

      <div className="settings-section" style={{ marginTop: '2rem' }}>
        <h3>RECENT SCRIMS</h3>
        <p className="section-desc">Historical data from previously uploaded logs will appear here.</p>
        <div style={{ marginTop: '1rem', fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
          Feature coming soon: detailed dashboards for each match.
        </div>
      </div>
    </div>
  );
};

export default ScrimLogTab;


