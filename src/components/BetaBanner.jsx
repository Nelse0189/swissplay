import './BetaBanner.css';

const BetaBanner = () => {
  return (
    <div className="beta-banner" role="banner">
      <span className="beta-banner__text">
        We're in open beta — features may change and you might encounter bugs. Thanks for trying us out!
      </span>
    </div>
  );
};

export default BetaBanner;
