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
import { syncService } from './utils/SyncService.js';

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

  useEffect(() => {
    // Update URL when selected note changes
    if (selectedId) {
      const note = notes.find(note => note.id === selectedId);
      if (note) {
        // Create URL-friendly slug from note title
        const title = note.visibleTitle || noteContentService.getFirstLine(note.content) || 'untitled';
        const slug = title.toLowerCase()
          .replace(/[^\w\s-]/g, '') // Remove special characters
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
          .slice(0, 100); // Limit length
        
        // Get folder path if note is in a folder
        let folderPath = '';
        let currentFolderId = note.parentFolderId;
        
        if (currentFolderId) {
          const folderPathSegments = [];
          while (currentFolderId) {
            const folder = notes.find(n => n.id === currentFolderId);
            if (!folder) break;
            
            // Create folder slug
            const folderName = folder.visibleTitle || 
              noteContentService.getFirstLine(folder.content) || 
              'folder';
            const folderSlug = folderName.toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-');
            
            folderPathSegments.unshift(folderSlug);
            currentFolderId = folder.parentFolderId;
          }
          folderPath = folderPathSegments.join('/');
          if (folderPath) {
            folderPath += '/';
          }
        }
        
        // Update URL without reloading the page
        if (slug && slug !== 'untitled') {
          window.history.pushState(
            { noteId: selectedId }, 
            '', 
            `/${folderPath}${slug}#${selectedId}`
          );
        }
      }
    } else {
      // Reset URL to home when no note is selected
      window.history.pushState({}, '', '/');
    }
  }, [selectedId, notes]);

  useEffect(() => {
    // Handle browser navigation (back/forward)
    const handlePopState = (event) => {
      if (event.state && event.state.noteId) {
        setSelectedId(event.state.noteId);
        noteNavigation.push(event.state.noteId);
      } else {
        // Try to extract note ID from URL hash
        const hash = window.location.hash;
        if (hash && hash.startsWith('#')) {
          const noteId = parseInt(hash.substring(1));
          if (!isNaN(noteId) && notes.some(note => note.id === noteId)) {
            setSelectedId(noteId);
            noteNavigation.push(noteId);
            return;
          }
        }
        
        // Try to match by pathname
        const pathname = window.location.pathname;
        if (pathname && pathname !== '/') {
          // Remove leading and trailing slashes
          const path = pathname.replace(/^\/|\/$/g, '');
          
          // Split path by segments
          const segments = path.split('/');
          const lastSegment = segments[segments.length - 1];
          
          // Try to find a matching note
          let matchedNote = null;
          
          for (const note of notes) {
            const title = note.visibleTitle || noteContentService.getFirstLine(note.content) || '';
            const noteSlug = title.toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-');
            
            if (noteSlug === lastSegment) {
              matchedNote = note;
              
              // If there are multiple path segments, ensure folder structure matches
              if (segments.length > 1 && note.parentFolderId) {
                let currentFolderId = note.parentFolderId;
                let matchesPath = true;
                
                // Traverse up the folder hierarchy
                for (let i = segments.length - 2; i >= 0; i--) {
                  const folder = notes.find(n => n.id === currentFolderId);
                  if (!folder) {
                    matchesPath = false;
                    break;
                  }
                  
                  const folderName = folder.visibleTitle || 
                    noteContentService.getFirstLine(folder.content) || 
                    'folder';
                  const folderSlug = folderName.toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-');
                  
                  if (folderSlug !== segments[i]) {
                    matchesPath = false;
                    break;
                  }
                  
                  currentFolderId = folder.parentFolderId;
                }
                
                if (!matchesPath) {
                  matchedNote = null;
                  continue;
                }
              }
              
              break;
            }
          }
          
          if (matchedNote) {
            setSelectedId(matchedNote.id);
            noteNavigation.push(matchedNote.id);
            return;
          }
        }
        
        setSelectedId(null);
        noteNavigation.push(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Check initial URL
    handlePopState({ state: history.state });
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [notes]);

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
          notes={notes}
        />
      </div>
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        setNotes={setNotes}
        onNoteSelect={handleNoteSelect}
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