import React, { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { ItemComponents } from './Modal';

function LockedWindow({ onUnlock, note }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(null);

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
      marginBottom: '45px',
      textAlign: 'center',
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
      width: '100%',
      maxWidth: '300px'
    },
    showPasswordContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '12px',
      color: '#6b7280',
      marginTop: '8px'
    },
    switch: {
      transform: 'scale(0.8) !important',
      marginRight: '4px !important'
    }
  };
  
    // Reset form when note changes
    useEffect(() => {
      setPassword('');
      setError('');
      setShowPassword(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, [note?.id]);
  
    // Handle any keypress when the window is active
    useEffect(() => {
      const handleKeyPress = (e) => {
        // Check if any modal is open
        const modalOverlay = document.querySelector('.modal-overlay');
        if (modalOverlay) {
          return; // Don't focus if a modal is open
        }
  
        // Ignore keypresses if we're already focused on the input
        if (document.activeElement === inputRef.current) {
          return;
        }
        
        // Ignore keypresses if user is typing in another input or contenteditable
        const activeElement = document.activeElement;
        if (activeElement?.tagName === 'INPUT' || 
            activeElement?.tagName === 'TEXTAREA' || 
            activeElement?.isContentEditable) {
          return;
        }
        
        // Focus the input field when any key is pressed
        if (inputRef.current) {
          inputRef.current.focus();
        }
      };
  
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }, []);
  
    const handleSubmit = async (e) => {
      e.preventDefault();
      
      if (!password.trim()) {
        setError('Please enter a password');
        return;
      }
  
      try {
        const result = await onUnlock(password);
        
        if (!result) {
          setError('Invalid password');
          setPassword(''); // Clear password on error
          return;
        }
      } catch (err) {
        console.error('Error unlocking note:', err);
        setError('Failed to unlock note');
        setPassword(''); // Clear password on error
      }
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
              ref={inputRef}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
            {error && <div style={{ color: '#ff4444', fontSize: '12px', marginTop: '4px' }}>{error}</div>}
            
            <div style={styles.showPasswordContainer}>
              <div className="locked-window-switch">
                <ItemComponents.SWITCH
                  value={showPassword}
                  onChange={() => setShowPassword(!showPassword)}
                />
              </div>
              <span>Show password</span>
            </div>
            
            <button type="submit" className="w-full primary" style={{ marginTop: '16px' }}>
              Unlock
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LockedWindow;