import Spinner from './Spinner';
import './LoadingState.css';

const LoadingState = ({ message = 'Loading...' }) => {
  return (
    <div className="loading-state">
      <Spinner size="md" label={message} />
    </div>
  );
};

export default LoadingState;
