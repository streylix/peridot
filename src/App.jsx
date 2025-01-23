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

  useEffect(() => {
    localStorage.setItem('notes', JSON.stringify(notes));
  }, [notes]);

  const sortNotes = (notesToSort) => {
    return notesToSort.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.dateModified) - new Date(a.dateModified);
    });
  };

  const togglePin = (noteId) => {
    setNotes(prevNotes => {
      const updatedNotes = prevNotes.map(note => 
        note.id === noteId 
          ? { ...note, pinned: !note.pinned }
          : note
      );
      return sortNotes(updatedNotes);
    });
  };

  const deleteNote = (noteId) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
      if (noteId === selectedId) {
        setSelectedId(null);
      }
    }
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
        onDeleteNote={deleteNote}
      />
      <div className="main-container">
        <Sidebar 
          selectedId={selectedId}
          onNoteSelect={setSelectedId}
          notes={notes}
          setNotes={setNotes}
          onDeleteNote={deleteNote}
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