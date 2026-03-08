import React from 'react';
import './CustomTabs.css';

const CustomTabs = ({ tabs, activeTab, onChange }) => {
  return (
    <div className="custom-tabs-container">
      <div className="custom-tabs-track">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`custom-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            <span className="tab-label">
              {tab.icon}
              {tab.label}
            </span>
            {activeTab === tab.id && <div className="tab-indicator" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CustomTabs;


