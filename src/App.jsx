import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import NavigationHistory from './utils/NavigationHistory';
import ModalDebug from './components/DebugModal';
import LockNoteModal from './components/LockNoteModal';
import UnlockNoteModal from './components/UnlockNoteModal';
import GifModal from './components/GifModal';
import { storageService } from './utils/StorageService.js';
import DownloadUnlockModal from './components/DownloadUnlockModal.jsx';
import { performDownload } from './utils/downloadUtils';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentModal, setCurrentModal] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [navigationHistory] = useState(() => new NavigationHistory());
  const [gifToAdd, setGifToAdd] = useState(null);
  const [notes, setNotes] = useState([]);
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const [isDownloadUnlockModalOpen, setIsDownloadUnlockModalOpen] = useState(false);
  const [downloadNoteId, setDownloadNoteId] = useState(null);
  const [isDownloadable, setDownloadable] = useState(false);
  const [preferredFileType, setPreferredFileType] = useState(
    localStorage.getItem('preferredFileType') || 'json'
  );

  const selectedNote = notes.find(note => note.id === selectedId);

  useEffect(() => {
    if (isDownloadable && downloadNoteId) {
      const noteToDownload = notes.find(note => note.id === downloadNoteId);
      if (noteToDownload) {
        const preferredFileType = localStorage.getItem('preferredFileType') || 'json';
        performDownload(noteToDownload, preferredFileType);
        setDownloadable(false);
        setDownloadNoteId(null);
      }
    }
  }, [isDownloadable, downloadNoteId, notes]);

  const handleLockModalOpen = () => {
    setIsLockModalOpen(true);
  };

  const handleUnlockModalOpen = () => {
    setIsUnlockModalOpen(true);
  };

  const handleDownloadUnlockModalOpen = (noteId) => {
    setDownloadNoteId(noteId);
    setIsDownloadUnlockModalOpen(true);
  };

  const handleDownloadUnlock = (password) => {
    const noteToDownload = notes.find(note => note.id === downloadNoteId);
    
    if (noteToDownload && password === noteToDownload.tempPass) {
      setIsDownloadUnlockModalOpen(false);
      setDownloadable(true);
      return true;
    }
    setDownloadable(false);
    setDownloadNoteId(null);
    return false;
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
    const loadNotes = async () => {
      try {
        const savedNotes = await storageService.getAllNotes();
        setNotes(sortNotes(savedNotes));
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    };
    loadNotes();
  }, []);

  useEffect(() => {
    const saveNotes = async () => {
      try {
        await Promise.all(notes.map(note => 
          storageService.writeNote(note.id, note)
        ));
      } catch (error) {
        console.error('Failed to save notes:', error);
      }
    };
    saveNotes();
  }, [notes]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    
    if (savedTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.classList.toggle('dark-mode', prefersDark);
    } else {
      document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    }
  }, []);

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

  const deleteNote = async (noteId) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await storageService.deleteNote(noteId);
        setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
        if (noteId === selectedId) {
          setSelectedId(null);
        }
      } catch (error) {
        console.error('Failed to delete note:', error);
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

  const handleGifModalOpen = () => {
    setIsGifModalOpen(true);
  };

  const handleAddGif = (gifUrl) => {
    setGifToAdd(gifUrl);
  };

  const updateNote = (updates, updateModified = true) => {
    setNotes(prevNotes => {
      const updatedNotes = prevNotes.map(note => 
        note.id === selectedId 
          ? { 
              ...note, 
              ...updates,
              dateModified: updateModified ? new Date().toISOString() : note.dateModified 
            }
          : note
      );

      const updatedNote = updatedNotes.find(note => note.id === selectedId);
      if (updatedNote) {
        storageService.writeNote(selectedId, updatedNote)
          .catch(error => console.error('Failed to save note:', error));
      }

      return sortNotes(updatedNotes);
    });
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
        onGifModalOpen={handleGifModalOpen}
        onDownloadUnlockModalOpen={handleDownloadUnlockModalOpen}
      />
      <div className="main-container">
        <Sidebar
          selectedId={selectedId}
          onNoteSelect={handleNoteSelect}
          notes={notes}
          setNotes={setNotes}
          onDeleteNote={deleteNote}
          onUnlockNote={handleUnlockNote}
          onTogglePin={togglePin}
          onLockModalOpen={handleLockModalOpen}
          onUnlockModalOpen={handleUnlockModalOpen}
          onUpdateNote={updateNote}
          gifToAdd={gifToAdd}
          onGifAdded={setGifToAdd}
          onDownloadUnlockModalOpen={handleDownloadUnlockModalOpen}
          downloadNoteId={downloadNoteId}
          isDownloadable={isDownloadable}
          setDownloadable={setDownloadable}
          setDownloadNoteId={setDownloadNoteId}
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
      <DownloadUnlockModal
        isOpen={isDownloadUnlockModalOpen}
        onClose={() => {
          setIsDownloadUnlockModalOpen(false);
          setDownloadable(false);
          setDownloadNoteId(null);
        }}
        onConfirm={(password) => {
          if (!handleDownloadUnlock(password)) {
            setDownloadable(false);
            setDownloadNoteId(null);
          }
        }}
      />
      <GifModal
        isOpen={isGifModalOpen}
        onClose={() => setIsGifModalOpen(false)}
        onConfirm={handleAddGif}
      />
    </div>
  );
}

export default App;