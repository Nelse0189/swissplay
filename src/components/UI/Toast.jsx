import './Toast.css';

const Toast = ({ message, type = 'info' }) => {
  return (
    <div className={`toast toast--${type}`} role="alert">
      {message}
    </div>
  );
};

export default Toast;
