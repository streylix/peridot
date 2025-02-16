import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import { noteNavigation } from './utils/NoteNavigationUtil';
import GifModal from './components/GifModal';
import PDFExportModal from './components/PDFExportModal';
import MainContent from './components/MainContent.jsx';
import PasswordModal from './components/PasswordModal.jsx';
import RenameModal from './components/RenameModal.jsx';

import { encryptNote, decryptNote, reEncryptNote, permanentlyUnlockNote } from './utils/encryption';
import { passwordStorage } from './utils/PasswordStorageService';
import { storageService } from './utils/StorageService.js';
import { noteContentService } from './utils/NoteContentService.js';
import { noteUpdateService } from './utils/NoteUpdateService.js';
import { passwordModalUtils } from './utils/PasswordModalUtils.js';
import { noteImportExportService } from './utils/NoteImportExportService.js';
import { noteSortingService } from './utils/NoteSortingService.js';
import { FolderService } from './utils/folderUtils.js';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentModal, setCurrentModal] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [gifToAdd, setGifToAdd] = useState(null);
  const [notes, setNotes] = useState([]);
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const [downloadNoteId, setDownloadNoteId] = useState(null);
  const [isDownloadable, setDownloadable] = useState(false);
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState(false);
  const [pdfExportNote, setPdfExportNote] = useState(null);
  const [updateQueue, setUpdateQueue] = useState([]);
  const processingRef = useRef(false);
  const [isRenameModalOpen, setRenameModalOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
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
    const handleRenameModal = (event) => {
      setItemToRename(event.detail.item);
      setRenameModalOpen(true);
    };

    window.addEventListener('openRenameModal', handleRenameModal);
    return () => window.removeEventListener('openRenameModal', handleRenameModal);
  }, []);

  const handleDownloadUnlockModalOpen = (noteId) => {
    const noteToDownload = notes.find(note => note.id === downloadNoteId);
    const callbacks = {
      setPdfExportNote,
      setIsPdfExportModalOpen
    };
    passwordModalUtils.openDownloadUnlockModal(noteId, noteToDownload, callbacks);
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
        setNotes(noteSortingService.sortNotes(savedNotes));
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

  const togglePin = (itemId) => {
    setNotes(prevNotes => {
      const updatedNotes = prevNotes.map(item => 
        item.id === itemId 
          ? { ...item, pinned: !item.pinned }
          : item
      );
      return noteSortingService.sortNotes(updatedNotes);
    });
  };

  const deleteNote = async (noteId) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        const itemToDelete = notes.find(note => note.id === noteId);
        
        if (FolderService.isFolder(itemToDelete)) {
          // If it's a folder, delete all its contents first
          const childItems = notes.filter(note => note.parentFolderId === noteId);
          
          // Delete all child items
          for (const childItem of childItems) {
            await storageService.deleteNote(childItem.id);
          }
        }
        
        // Delete the note/folder itself
        await storageService.deleteNote(noteId);
        
        // Update notes state, removing the deleted item and its children
        setNotes(prevNotes => 
          prevNotes.filter(note => 
            note.id !== noteId && 
            note.parentFolderId !== noteId
          )
        );
        
        // Clear selection if the deleted item was selected
        if (noteId === selectedId) {
          setSelectedId(null);
        }
      } catch (error) {
        console.error('Failed to delete note:', error);
      }
    }
  };

  const findNoteInNotes = (noteId, notes) => {
    for (const item of notes) {
      if (item.id === noteId) return item;
      
      if (FolderService.isFolder(item) && item.items) {
        const foundInFolder = item.items.find(subItem => subItem.id === noteId);
        if (foundInFolder) return foundInFolder;
      }
    }
    return null;
  };
  
  const handleNoteSelect = (noteId) => {
    setSelectedId(noteId);
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

  const updateNote = async (updates, updateModified = true) => {
    await noteUpdateService.queueUpdate(selectedId, updates, updateModified);
  };

  const sidebarRef = useRef();

  const handleToggleSidebar = () => {
    if (sidebarRef.current && sidebarRef.current.toggleSidebar) {
      sidebarRef.current.toggleSidebar();
    }
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
        onGifModalOpen={handleGifModalOpen}
        setPdfExportNote={setPdfExportNote}
        setIsPdfExportModalOpen={setIsPdfExportModalOpen}
        onToggleSidebar={handleToggleSidebar}
      />
      <div className="main-container">
        <Sidebar
          selectedId={selectedId}
          onNoteSelect={handleNoteSelect}
          notes={notes}
          setNotes={setNotes}
          onDeleteNote={deleteNote}
          onTogglePin={togglePin}
          onGifAdded={setGifToAdd}
          downloadNoteId={downloadNoteId}
          isDownloadable={isDownloadable}
          setDownloadable={setDownloadable}
          setDownloadNoteId={setDownloadNoteId}
          setPdfExportNote={setPdfExportNote}
          setIsPdfExportModalOpen={setIsPdfExportModalOpen}
          ref={sidebarRef}
        />
        <MainContent 
          note={selectedNote}
          onUpdateNote={updateNote}
          gifToAdd={gifToAdd} 
          onGifAdded={setGifToAdd}
          setNotes={setNotes}
          onNoteSelect={handleNoteSelect}
        />
      </div>
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        setNotes={setNotes}
        onNoteSelect={setSelectedId}
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
          noteImportExportService.downloadNote({
            note: pdfExportNote,
            fileType: 'pdf',
            isEncrypted: pdfExportNote?.locked || false,
            pdfSettings
          });
          setPdfExportNote(null);
        }}
      />
      <RenameModal
        isOpen={isRenameModalOpen}
        onClose={() => {
          setRenameModalOpen(false);
          setItemToRename(null);
        }}
        item={itemToRename}
        onSuccess={(updatedItem) => {
          setNotes(prevNotes => 
            prevNotes.map(note => 
              note.id === updatedItem.id ? updatedItem : note
            )
          );
        }}
      />
    </div>
  );
}

export default App;