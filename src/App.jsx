import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import { noteNavigation } from './utils/NoteNavigationUtil';
import ModalDebug from './components/DebugModal';
import LockNoteModal from './components/LockNoteModal';
import UnlockNoteModal from './components/UnlockNoteModal';
import GifModal from './components/GifModal';
import DownloadUnlockModal from './components/DownloadUnlockModal.jsx';
import PDFExportModal from './components/PDFExportModal';
import MainContent from './components/MainContent.jsx';
import PasswordModal from './components/PasswordModal.jsx';

import { encryptNote, decryptNote, reEncryptNote, permanentlyUnlockNote } from './utils/encryption';
import { passwordStorage } from './utils/PasswordStorageService';
import { storageService } from './utils/StorageService.js';
import { noteContentService } from './utils/NoteContentService.js';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentModal, setCurrentModal] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [gifToAdd, setGifToAdd] = useState(null);
  const [notes, setNotes] = useState([]);
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const [isDownloadUnlockModalOpen, setIsDownloadUnlockModalOpen] = useState(false);
  const [downloadNoteId, setDownloadNoteId] = useState(null);
  const [isDownloadable, setDownloadable] = useState(false);
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState(false);
  const [pdfExportNote, setPdfExportNote] = useState(null);
  const [updateQueue, setUpdateQueue] = useState([]);
  const processingRef = useRef(false);
  const [preferredFileType, setPreferredFileType] = useState(
    localStorage.getItem('preferredFileType') || 'json'
  );

  const selectedNote = notes.find(note => note.id === selectedId);

  useEffect(() => {
    const handleNoteUpdate = (event) => {
      setNotes(prevNotes => prevNotes.map(note => 
        note.id === event.detail.note.id ? event.detail.note : note
      ));
    };
  
    window.addEventListener('noteUpdate', handleNoteUpdate);
    return () => window.removeEventListener('noteUpdate', handleNoteUpdate);
  }, []);

  useEffect(() => {
    if (isDownloadable && downloadNoteId) {
      const noteToDownload = notes.find(note => note.id === downloadNoteId);
      const preferredFileType = localStorage.getItem('preferredFileType') || 'json';
      if (noteToDownload) {
        if (preferredFileType === 'pdf') {
          setPdfExportNote(noteToDownload);
          setIsPdfExportModalOpen(true);
          setDownloadable(false);
          setDownloadNoteId(null);
        } else {
          noteContentService.performDownload(noteToDownload, preferredFileType);
          setDownloadable(false);
          setDownloadNoteId(null);
        }
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

  const handleDebugModalClose = () => {
    const nextModal = {
      small: 'default',
      default: 'large',
      large: null
    }[currentModal];
    setCurrentModal(nextModal);
  };

  useEffect(() => {
    const unsubscribe = noteNavigation.subscribe((noteId) => {
      setSelectedId(noteId);
    });
    return () => unsubscribe();
  }, []);

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

    const selectedNote = notes.find(note => note.id === noteId);
  
    if (selectedNote) {
      console.log('Selected Note Contents:', {
        id: selectedNote.id,
        content: selectedNote.content,
        locked: selectedNote.locked,
        encrypted: selectedNote.encrypted
      });
    }
    
    noteNavigation.push(noteId);
  };

  const handleBack = () => {
    noteNavigation.back();
  };

  const handleGifModalOpen = () => {
    setIsGifModalOpen(true);
  };

  const handleAddGif = (gifUrl) => {
    setGifToAdd(gifUrl);
  };

  useEffect(() => {
    const processUpdates = async () => {
      if (processingRef.current || updateQueue.length === 0) return;
      
      processingRef.current = true;
      const update = updateQueue[0];

      try {
        console.log('Processing update:', {
          noteId: update.noteId,
          isEncrypted: update.updates._isEncryptedUpdate
        });

        const updatedNotes = notes.map(note => {
          if (note.id === update.noteId) {
            if (update.updates._isEncryptedUpdate) {
              // Handle encrypted updates
              const { _isEncryptedUpdate, ...encryptedUpdates } = update.updates;
              return encryptedUpdates;
            }
            // Handle normal updates
            return {
              ...note,
              ...update.updates,
              dateModified: update.updateModified ? new Date().toISOString() : note.dateModified
            };
          }
          return note;
        });

        // Save only the modified note
        const modifiedNote = updatedNotes.find(note => note.id === update.noteId);
        if (modifiedNote) {
          await storageService.writeNote(update.noteId, modifiedNote);
        }

        setNotes(sortNotes(updatedNotes));
        setUpdateQueue(prevQueue => prevQueue.slice(1));
      } catch (error) {
        console.error('Failed to process update:', error);
      } finally {
        processingRef.current = false;
      }
    };

    processUpdates();
  }, [updateQueue, notes]);

  const updateNote = async (updates, updateModified = true) => {
    console.log('Queueing note update:', {
      noteId: selectedId,
      isEncrypted: updates._isEncryptedUpdate
    });

    setUpdateQueue(prevQueue => [
      ...prevQueue,
      {
        noteId: selectedId,
        updates,
        updateModified
      }
    ]);
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
        canGoBack={noteNavigation.canGoBack()}
        onDebugClick={() => setCurrentModal('small')}
        // onLockNote={handleLockNote}
        onLockModalOpen={handleLockModalOpen}
        onUnlockModalOpen={handleUnlockModalOpen}
        onGifModalOpen={handleGifModalOpen}
        onDownloadUnlockModalOpen={handleDownloadUnlockModalOpen}
        setPdfExportNote={setPdfExportNote}
        setIsPdfExportModalOpen={setIsPdfExportModalOpen}
      />
      <div className="main-container">
        <Sidebar
          selectedId={selectedId}
          onNoteSelect={handleNoteSelect}
          notes={notes}
          setNotes={setNotes}
          onDeleteNote={deleteNote}
          // onUnlockNote={handleUnlockNote}
          onTogglePin={togglePin}
          onLockModalOpen={handleLockModalOpen}
          onUnlockModalOpen={handleUnlockModalOpen}
          onGifAdded={setGifToAdd}
          onDownloadUnlockModalOpen={handleDownloadUnlockModalOpen}
          downloadNoteId={downloadNoteId}
          isDownloadable={isDownloadable}
          setDownloadable={setDownloadable}
          setDownloadNoteId={setDownloadNoteId}
          setPdfExportNote={setPdfExportNote}
          setIsPdfExportModalOpen={setIsPdfExportModalOpen}
        />
      </div>
      <MainContent 
        note={notes.find(note => note.id === selectedId)}
        onUpdateNote={updateNote}
        gifToAdd={gifToAdd} 
        onGifAdded={setGifToAdd}
      />
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        setNotes={setNotes}
      />
      <ModalDebug
        currentModal={currentModal}
        onClose={handleDebugModalClose}
      />
      <PasswordModal />
      <GifModal
        isOpen={isGifModalOpen}
        onClose={() => setIsGifModalOpen(false)}
        onConfirm={handleAddGif}
      />
      <PDFExportModal 
        isOpen={isPdfExportModalOpen}
        onClose={() => setIsPdfExportModalOpen(false)}
        noteTitle={pdfExportNote ? noteContentService.getFirstLine(pdfExportNote.content) : ''}
        onExport={(pdfSettings) => {
          noteContentService.performDownload(pdfExportNote, 'pdf', pdfSettings);
          setPdfExportNote(null);
        }}
    />
    </div>
  );
}

export default App;