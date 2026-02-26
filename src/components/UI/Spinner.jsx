import './Spinner.css';

const Spinner = ({ size = 'md', label }) => {
  return (
    <div className={`spinner-wrapper spinner-wrapper--${size}`}>
      <div className="spinner" aria-hidden="true" />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  );
};

export default Spinner;
