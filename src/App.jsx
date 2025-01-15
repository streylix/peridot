import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // Apply dark mode on initial load if previously set
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }, []);

  const openSettings = () => {
    console.log('Open settings called');
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    console.log('Close settings called');
    setIsSettingsOpen(false);
  };

  return (
    <div className="app">
      <Header 
        onSettingsClick={() => {
          console.log('Settings click in Header');
          openSettings();
        }} 
        onDarkModeClick={() => {
          console.log('Dark mode click in Header');
          openSettings();
        }}
      />
      <div className="main-container">
        <Sidebar 
          selectedId={selectedId}
          onNoteSelect={setSelectedId}
        />
      </div>
      <Settings 
        isOpen={isSettingsOpen}
        onClose={closeSettings}
      />
    </div>
  );
}

export default App;