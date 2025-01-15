import React, { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  return (
    <div className="app">
      <Header onSettingsClick={() => setIsSettingsOpen(true)} />
      <div className="main-container">
        <Sidebar 
          selectedId={selectedId}
          onNoteSelect={setSelectedId}
        />
      </div>
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;