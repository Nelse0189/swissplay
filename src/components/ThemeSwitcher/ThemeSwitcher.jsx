import React, { useState, useEffect } from 'react';
import { colorPalettes } from '../../styles/palettes';
import './ThemeSwitcher.css';

const ThemeSwitcher = () => {
  const [selectedPalette, setSelectedPalette] = useState('slate-steel');
  const [savedCustomThemes, setSavedCustomThemes] = useState([]);

  useEffect(() => {
    // Load saved palette from localStorage
    const saved = localStorage.getItem('swissplay-color-palette');
    const savedCustom = localStorage.getItem('swissplay-custom-themes');
    
    if (savedCustom) {
      try {
        setSavedCustomThemes(JSON.parse(savedCustom));
      } catch (e) {
        console.error('Error loading custom themes:', e);
      }
    }
    
    if (saved) {
      setSelectedPalette(saved);
      applyPalette(saved);
    } else {
      applyPalette('slate-steel');
    }
  }, []);

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  };

  const applyPalette = (paletteId) => {
    let palette;
    
    // Check if it's a custom theme
    if (paletteId.startsWith('custom-')) {
      const customTheme = savedCustomThemes.find(t => t.id === paletteId);
      palette = customTheme || colorPalettes[0];
    } else {
      palette = colorPalettes.find(p => p.id === paletteId) || colorPalettes[0];
    }
    
    const root = document.documentElement;
    const colors = palette.colors;
    
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-accent', colors.accent);

    // Set RGB versions for transparency
    root.style.setProperty('--color-primary-rgb', hexToRgb(colors.primary));
    root.style.setProperty('--color-secondary-rgb', hexToRgb(colors.secondary));
    root.style.setProperty('--color-background-rgb', hexToRgb(colors.background));
    root.style.setProperty('--color-text-rgb', hexToRgb(colors.text));
    root.style.setProperty('--color-accent-rgb', hexToRgb(colors.accent));

    // Dynamic adjustment for light/dark mode
    const isLight = isColorLight(colors.background);
    if (isLight) {
      root.style.setProperty('--color-background-light', 'rgba(0, 0, 0, 0.05)');
      root.style.setProperty('--color-background-card', 'rgba(0, 0, 0, 0.02)');
      root.style.setProperty('--color-text-secondary', 'rgba(0, 0, 0, 0.6)');
      root.style.setProperty('--color-border', 'rgba(0, 0, 0, 0.1)');
    } else {
      root.style.setProperty('--color-background-light', 'rgba(255, 255, 255, 0.05)');
      root.style.setProperty('--color-background-card', 'rgba(255, 255, 255, 0.03)');
      root.style.setProperty('--color-text-secondary', 'rgba(255, 255, 255, 0.6)');
      root.style.setProperty('--color-border', 'rgba(255, 255, 255, 0.1)');
    }
  };

  const isColorLight = (color) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 155;
  };

  const handlePaletteChange = (paletteId) => {
    setSelectedPalette(paletteId);
    applyPalette(paletteId);
    localStorage.setItem('swissplay-color-palette', paletteId);
  };

  const allPalettes = [...colorPalettes, ...savedCustomThemes];

  return (
    <div className="theme-switcher">
      <div className="theme-header">
        <h2>WEBSITE THEME</h2>
        <p className="theme-description">Select a professional color palette designed with modern color theory.</p>
      </div>

      <div className="palette-grid">
        {allPalettes.map((palette) => (
          <div
            key={palette.id}
            className={`palette-card ${selectedPalette === palette.id ? 'selected' : ''}`}
            onClick={() => handlePaletteChange(palette.id)}
          >
            <div className="palette-preview-main">
              <div className="color-strip" style={{ backgroundColor: palette.colors.background }}></div>
              <div className="color-strip" style={{ backgroundColor: palette.colors.primary }}></div>
              <div className="color-strip" style={{ backgroundColor: palette.colors.accent }}></div>
              <div className="color-strip" style={{ backgroundColor: palette.colors.text }}></div>
            </div>
            <div className="palette-info">
              <span className="palette-name">{palette.name}</span>
              <span className="palette-desc">{palette.description}</span>
            </div>
            {selectedPalette === palette.id && (
              <div className="selected-badge">ACTIVE</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThemeSwitcher;
