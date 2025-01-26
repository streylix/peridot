import React, { useState } from 'react';
import { Lock } from 'lucide-react';

function LockedWindow({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const styles = {
    container: {
      display: 'flex',
      height: 'calc(100% - 45px)',
      alignItems: 'center',
      justifyContent: 'center'
    },
    content: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      maxWidth: '28rem',
      width: '100%',
      padding: '2rem',
      marginBottom: '45px'
    },
    icon: {
      width: '4rem',
      height: '4rem',
      color: '#9ca3af',
      marginBottom: '1.5rem'
    },
    title: {
      fontSize: '1.25rem',
      fontWeight: 600,
      marginBottom: '0.1rem'
    },
    subtitle: {
      color: '#6b7280',
      marginBottom: '2rem'
    },
    form: {
      width: '100%'
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter a password');
      return;
    }
    onUnlock(password);
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <Lock style={styles.icon} />
        <h2 style={styles.title}>This note is password protected</h2>
        <p style={styles.subtitle}>Enter password to view</p>
        
        <div className="outer-small" style={styles.form}>
          <form onSubmit={handleSubmit} className="inner-small">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
            />
            {error && <div style={{ color: '#ff4444', fontSize: '14px' }}>{error}</div>}
            <button type="submit" className="w-full primary">
              Unlock
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LockedWindow;