import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [notes, setNotes] = useState(() => {
    const savedNotes = localStorage.getItem('notes');
    return savedNotes ? JSON.parse(savedNotes) : [];
  });

  // Save notes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notes', JSON.stringify(notes));
  }, [notes]);

  const togglePin = (noteId) => {
    console.log('App - togglePin called with noteId:', noteId);
    setNotes(prevNotes => {
      console.log('App - Current notes:', prevNotes);
      const updatedNotes = prevNotes.map(note => {
        if (note.id === noteId) {
          console.log('App - Toggling note:', note);
          return { ...note, pinned: !note.pinned };
        }
        return note;
      });
      console.log('App - Notes after toggle:', updatedNotes);
      // Sort notes with pinned at top
      const sortedNotes = updatedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.dateModified) - new Date(a.dateModified);
      });
      console.log('App - Final sorted notes:', sortedNotes);
      return sortedNotes;
    });
  };

  const openSettings = () => {
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  return (
    <div className="app">
      <Header 
        onSettingsClick={openSettings}
        selectedId={selectedId}
        notes={notes}
        onTogglePin={togglePin}
      />
      <div className="main-container">
        <Sidebar 
          selectedId={selectedId}
          onNoteSelect={setSelectedId}
          notes={notes}
          setNotes={setNotes}
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