import React, { useState, useEffect } from 'react';

function Settings({ isOpen, onClose }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check local storage for existing dark mode preference
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    console.log('Settings modal isOpen:', isOpen);
  }, [isOpen]);

  useEffect(() => {
    // Apply dark mode when component mounts or isDarkMode changes
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Render nothing if not open
  if (!isOpen) {
    console.log('Settings modal not rendering due to !isOpen');
    return null;
  }

  console.log('Settings modal rendering');

  return (
    <div className="dark-mode-modal-overlay">
      <div className="dark-mode-modal-content">
        <button className="dark-mode-modal-close" onClick={onClose}>
          ✕
        </button>
        <h2>Settings</h2>
        <div className="settings-section">
          <div className="dark-mode-switch-container">
            <span>Dark Mode</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={isDarkMode}
                onChange={toggleDarkMode}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>
        <div className="settings-section">
          <button className="btn btn-danger" disabled>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;