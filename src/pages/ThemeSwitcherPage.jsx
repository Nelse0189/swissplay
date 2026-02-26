import ThemeSwitcher from '../components/ThemeSwitcher/ThemeSwitcher';
import './ThemeSwitcherPage.css';

const ThemeSwitcherPage = () => {
  return (
    <div className="theme-switcher-page">
      <div className="content-wrapper">
        <div className="dashboard-content">
          <ThemeSwitcher />
        </div>
      </div>
    </div>
  );
};

export default ThemeSwitcherPage;



