import React, { useState, useRef, useEffect } from 'react';
import './NavigationDropdown.css';

const NavigationDropdown = ({ label, sections = [], items = [], onItemClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Use capture phase to ensure it runs even if propagation is stopped elsewhere
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  }, [isOpen]);

  const handleItemClick = (item) => {
    if (item.onClick) {
      item.onClick();
    } else if (onItemClick) {
      onItemClick(item);
    }
    setIsOpen(false);
  };

  return (
    <div className="navigation-dropdown" ref={dropdownRef}>
      <button 
        className={`nav-dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{label}</span>
        <span className="dropdown-chevron">▼</span>
      </button>
      
      {isOpen && (
        <div className="nav-dropdown-panel">
          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="nav-dropdown-section">
              {section.label && (
                <div className="nav-section-header">{section.label}</div>
              )}
              {section.items && section.items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className={`nav-dropdown-item ${item.indent ? 'indent' : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  <img 
                    src={item.photoURL || '/default-team.svg'} 
                    alt={item.label}
                    className="nav-item-icon"
                    onError={(e) => {
                      e.target.src = '/default-team.svg';
                    }}
                  />
                  <span className="nav-item-label">{item.label}</span>
                </div>
              ))}
            </div>
          ))}
          
          {items.length > 0 && sections.length === 0 && (
            <div className="nav-dropdown-section">
              {items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className={`nav-dropdown-item ${item.indent ? 'indent' : ''}`}
                  onClick={() => handleItemClick(item)}
                >
                  <img 
                    src={item.photoURL || '/default-team.svg'} 
                    alt={item.label}
                    className="nav-item-icon"
                    onError={(e) => {
                      e.target.src = '/default-team.svg';
                    }}
                  />
                  <span className="nav-item-label">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NavigationDropdown;


