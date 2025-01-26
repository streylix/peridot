import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import NavigationHistory from './utils/NavigationHistory';
import ModalDebug from './components/DebugModal';
import LockNoteModal from './components/LockNoteModal';
import UnlockNoteModal from './components/UnlockNoteModal';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentModal, setCurrentModal] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [navigationHistory] = useState(() => new NavigationHistory());

  
  const [notes, setNotes] = useState(() => {
    const savedNotes = localStorage.getItem('notes');
    return savedNotes ? JSON.parse(savedNotes) : [];
  });
  
  const selectedNote = notes.find(note => note.id === selectedId);

  const handleLockModalOpen = () => {
    console.log("in app locking")
    setIsLockModalOpen(true);
  };

  const handleUnlockModalOpen = () => {
    setIsUnlockModalOpen(true);
  };
  
  const handleDebugModalClose = () => {
    const nextModal = {
      small: 'default',
      default: 'large',
      large: null
    }[currentModal];
    setCurrentModal(nextModal);
  };

  const handleLockNote = (noteId, password) => {
    console.log('Locking note:', noteId, password); // Add logging
    setNotes(prevNotes => 
      prevNotes.map(note => 
        note.id === noteId 
          ? { ...note, locked: true, tempPass: password }
          : note
      )
    );
  };
  
  const handleUnlockNote = (noteId) => {
    setNotes(prevNotes =>
      prevNotes.map(note =>
        note.id === noteId
          ? { ...note, locked: false, tempPass: null }
          : note
      )
    );
  };

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

  const handleNoteSelect = (noteId) => {
    navigationHistory.push(selectedId);
    setSelectedId(noteId);
  };

  const handleBack = () => {
    const previousState = navigationHistory.back();
    setSelectedId(previousState);
  };

  return (
    <div className="app">
      <Header
        onSettingsClick={() => setIsSettingsOpen(true)}
        selectedId={selectedId}
        notes={notes}
        onTogglePin={togglePin}
        onDeleteNote={deleteNote}
        onBack={handleBack}
        canGoBack={navigationHistory.canGoBack()}
        onDebugClick={() => setCurrentModal('small')}
        onLockNote={handleLockNote}
        onLockModalOpen={handleLockModalOpen}
        onUnlockModalOpen={handleUnlockModalOpen}
      />
      <div className="main-container">
        <Sidebar
          selectedId={selectedId}
          onNoteSelect={handleNoteSelect}
          notes={notes}
          setNotes={setNotes}
          onDeleteNote={deleteNote}
          onUnlockNote={handleUnlockNote}
        />
      </div>
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        setNotes={setNotes}
      />
      <ModalDebug
        currentModal={currentModal}
        onClose={handleDebugModalClose}
      />
      <LockNoteModal
        isOpen={isLockModalOpen}
        onClose={() => setIsLockModalOpen(false)}
        onConfirm={(password) => {
          handleLockNote(selectedId, password);
          setIsLockModalOpen(false);
        }}
      />
      <UnlockNoteModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        onConfirm={(password) => {
          if (password === selectedNote?.tempPass) {
            handleUnlockNote(selectedId);
            setIsUnlockModalOpen(false);
          }
        }}
      />
    </div>
  );
}

export default App;