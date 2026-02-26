import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import BetaBanner from './components/BetaBanner';
import PageTransition from './components/PageTransition';
import { ToastProvider } from './context/ToastContext';
import Home from './pages/Home';
import About from './pages/About';
import Creators from './pages/Creators';
import TeamManagement from './pages/TeamManagement';
import FindScrims from './pages/FindScrims';
import Auth from './pages/Auth';
import ThemeSwitcherPage from './pages/ThemeSwitcherPage';
import Profile from './pages/Profile';
import PublicPlayerProfile from './pages/PublicPlayerProfile';
import PublicTeamProfile from './pages/PublicTeamProfile';
import EditProfile from './pages/EditProfile';
import TierRating from './pages/TierRating';
import Revaluation from './pages/Revaluation';
import Help from './pages/Help';
import Contact from './pages/Contact';
import JoinTeam from './pages/JoinTeam';
import CreateTeam from './pages/CreateTeam';
import FreeAgents from './pages/FreeAgents';
import ScrimLogGuide from './pages/ScrimLogGuide';
import NotFound from './pages/NotFound';
import { colorPalettes } from './styles/palettes';
import './styles/theme.css';
import './App.css';

function App() {
  useEffect(() => {
    // Initialize theme on app load
    const saved = localStorage.getItem('swissplay-color-palette') || 'slate-steel';
    
    // Check if it's a custom theme
    let palette;
    if (saved.startsWith('custom-')) {
      const savedCustom = localStorage.getItem('swissplay-custom-themes');
      if (savedCustom) {
        try {
          const customThemes = JSON.parse(savedCustom);
          palette = customThemes.find(t => t.id === saved);
        } catch (e) {
          console.error('Error loading custom themes:', e);
        }
      }
    }
    
    if (!palette) {
      palette = colorPalettes.find(p => p.id === saved) || colorPalettes[0];
    }
    
    const root = document.documentElement;
    const colors = palette.colors;

    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r}, ${g}, ${b}`;
    };

    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-accent', colors.accent);

    root.style.setProperty('--color-primary-rgb', hexToRgb(colors.primary));
    root.style.setProperty('--color-secondary-rgb', hexToRgb(colors.secondary));
    root.style.setProperty('--color-background-rgb', hexToRgb(colors.background));
    root.style.setProperty('--color-text-rgb', hexToRgb(colors.text));
    root.style.setProperty('--color-accent-rgb', hexToRgb(colors.accent));

    // Dynamic adjustment for light/dark mode
    const isColorLight = (color) => {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 155;
    };

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
  }, []);

  return (
    <Router>
      <ToastProvider>
        <div className="app">
          <BetaBanner />
          <Header />
          <main className="main-content">
            <Routes>
              <Route element={<PageTransition><Outlet /></PageTransition>}>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/creators" element={<Creators />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/teams/overwatch" element={<TeamManagement />} />
                <Route path="/scrims" element={<FindScrims />} />
                <Route path="/theme" element={<ThemeSwitcherPage />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/:userId" element={<PublicPlayerProfile />} />
                <Route path="/profile/edit" element={<EditProfile />} />
                <Route path="/profile/tier-rating" element={<TierRating />} />
                <Route path="/profile/revaluation" element={<Revaluation />} />
                <Route path="/teams/:teamId" element={<PublicTeamProfile />} />
                <Route path="/help" element={<Help />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/teams/join" element={<JoinTeam />} />
                <Route path="/teams/create" element={<CreateTeam />} />
                <Route path="/free-agents" element={<FreeAgents />} />
                <Route path="/scrim-guide" element={<ScrimLogGuide />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </main>
          <Footer />
        </div>
      </ToastProvider>
    </Router>
  );
}

export default App;
