import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import { noteNavigation } from './utils/NoteNavigationUtil';
import GifModal from './components/GifModal';
import PDFExportModal from './components/PDFExportModal';
import MainContent from './components/MainContent.jsx';
import PasswordModal from './components/PasswordModal.jsx';
import RenameModal from './components/RenameModal.jsx';
import AuthPage from './components/LoginPage';

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
import { authService } from './utils/AuthService.js';
import { themeService } from './utils/ThemeService';
import { buildTools, processDynamicContent } from './utils/NoteTools';
import { downloadAsZip } from './utils/DownloadUtils';

function MainAppLayout({
  currentUser, 
  onLogout, 
  isSettingsOpen, setIsSettingsOpen,
  selectedId, handleNoteSelect,
  gifToAdd, setGifToAdd,
  notes, setNotes,
  isGifModalOpen, setIsGifModalOpen,
  isPdfExportModalOpen, setIsPdfExportModalOpen,
  pdfExportNote, setPdfExportNote,
  isRenameModalOpen, setRenameModalOpen,
  itemToRename, setItemToRename,
  togglePin,
  deleteNote,
  handleBack,
  handleGifModalOpen,
  handleAddGif,
  updateNote,
  handleToggleSidebar,
  appSidebarRef,
  isLocalMode
}) {
  const sidebarRef = useRef();

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
        onGifModalOpen={handleGifModalOpen}
        setPdfExportNote={setPdfExportNote}
        setIsPdfExportModalOpen={setIsPdfExportModalOpen}
        onToggleSidebar={handleToggleSidebar}
      />
      <div className="main-container">
        <Sidebar
          ref={sidebarRef}
          selectedId={selectedId}
          onNoteSelect={handleNoteSelect}
          notes={notes}
          setNotes={setNotes}
          onDeleteNote={deleteNote}
          onTogglePin={togglePin}
          setPdfExportNote={setPdfExportNote}
          setIsPdfExportModalOpen={setIsPdfExportModalOpen}
        />
        <MainContent 
          note={notes.find(note => note.id === selectedId)}
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
        currentUser={currentUser}
        onLogout={onLogout}
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
          if (pdfExportNote) {
            noteImportExportService.downloadNote({
              note: pdfExportNote,
              fileType: 'pdf',
              isEncrypted: pdfExportNote?.locked || false,
              pdfSettings
            });
          }
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

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [gifToAdd, setGifToAdd] = useState(null);
  const [notes, setNotes] = useState([]);
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState(false);
  const [pdfExportNote, setPdfExportNote] = useState(null);
  const [isRenameModalOpen, setRenameModalOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const appSidebarRef = useRef();

  // Debug function to help diagnose issues
  const debugUserState = () => {
    console.log("--- Debug User State ---");
    console.log("currentUser:", currentUser);
    console.log("currentUserId:", localStorage.getItem('currentUserId'));
    console.log("isAuthenticated:", isAuthenticated);
    console.log("isLocalMode:", isLocalMode);
    console.log("storageService.currentUserId:", storageService.currentUserId);
    console.log("------------------------");
  };

  // Initialize - check if user is logged in
  useEffect(() => {
    // Add a safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (isLoading) {
        console.log("Loading timeout reached - forcing completion");
        setIsLoading(false);
      }
    }, 5000); // 5 second timeout

    const checkAuth = async () => {
      setIsLoading(true);
      try {
        // Check authentication status with Django backend
        const response = await fetch('/api/check-auth/', {
          method: 'GET',
          credentials: 'include', // Include cookies for session-based auth
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("Auth check response:", data);
          
          if (data.isAuthenticated && data.user) {
            console.log("User is authenticated:", data.user);
            setCurrentUser(data.user);
            setIsAuthenticated(true);
            
            // Set the user ID in local storage and storage service
            localStorage.setItem('currentUserId', data.user.id.toString());
            storageService.setAuthToken(null, data.user.id.toString());
            storageService.setMigrateUnassociatedNotes(true);
            
            // Initialize sync service with the user ID
            syncService.setAuthToken(data.user.id.toString());
          } else {
            // Server says user is not authenticated
            console.log("User is not authenticated");
            setIsAuthenticated(false);
            setCurrentUser(null);
            setIsLocalMode(false);
            
            // Check if we have a userId in localStorage for local mode
            const storedUserId = localStorage.getItem('currentUserId');
            if (storedUserId) {
              console.log("Found stored user ID, using local mode:", storedUserId);
              setCurrentUser({ id: storedUserId });
              setIsAuthenticated(true);
              setIsLocalMode(true);
              
              // Initialize sync service with the stored user ID for local mode
              syncService.setAuthToken(storedUserId);
            } else {
              // Clear sync service auth
              syncService.setAuthToken(null);
            }
          }
        } else {
          // Server error or offline - try local mode if we have a user ID
          console.log("Auth check failed with status:", response.status);
          const storedUserId = localStorage.getItem('currentUserId');
          
          if (storedUserId) {
            console.log("Using local mode with stored user ID:", storedUserId);
            setCurrentUser({ id: storedUserId });
            setIsAuthenticated(true);
            setIsLocalMode(true);
            
            // Initialize sync service with the stored user ID for local mode
            syncService.setAuthToken(storedUserId);
          } else {
            setIsAuthenticated(false);
            setCurrentUser(null);
            
            // Clear sync service auth
            syncService.setAuthToken(null);
          }
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        
        // Network error - try local mode
        const storedUserId = localStorage.getItem('currentUserId');
        if (storedUserId) {
          console.log("Network error - falling back to local mode");
          setCurrentUser({ id: storedUserId });
          setIsAuthenticated(true);
          setIsLocalMode(true);
          
          // Initialize sync service with the stored user ID for local mode
          syncService.setAuthToken(storedUserId);
        } else {
          setIsAuthenticated(false);
          setCurrentUser(null);
          
          // Clear sync service auth
          syncService.setAuthToken(null);
        }
      } finally {
        setIsLoading(false);
        clearTimeout(loadingTimeout);
        debugUserState();
      }
    };
    
    checkAuth();
    
    return () => {
      clearTimeout(loadingTimeout);
    };
  }, []);

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
        // Clear notes first to avoid showing previous user's notes
        setNotes([]);
        setSelectedId(null);
        
        if (currentUser && currentUser.id) {
          // Debug output
          console.log("Loading notes for user:", currentUser.id);
          console.log("StorageService userId:", storageService.currentUserId);
          console.log("Local mode:", isLocalMode);
          
          // Ensure StorageService is configured to use this user's ID
          storageService.setAuthToken(null, currentUser.id);
          
          // Enable migration of unassociated notes to this user
          storageService.setMigrateUnassociatedNotes(true);
          
          // If not in local mode, fetch notes from backend first
          if (!isLocalMode) {
            console.log("Fetching and merging backend notes...");
            try {
              const mergeResult = await syncService.mergeBackendWithLocalNotes();
              console.log("Merge result:", mergeResult);
              
              // If we added or updated notes, update the UI
              if (mergeResult.success && (mergeResult.added > 0 || mergeResult.updated > 0)) {
                console.log(`Added ${mergeResult.added} notes, updated ${mergeResult.updated} notes from backend`);
              }
            } catch (syncError) {
              console.error("Failed to sync with backend:", syncError);
              // Continue with loading local notes even if sync fails
            }
          }
          
          // Load notes for the current user
          const savedNotes = await storageService.getAllNotes();
          console.log("Loaded notes:", savedNotes.length, savedNotes);
          
          const sortedNotes = noteSortingService.sortNotes(savedNotes);
          setNotes(sortedNotes);
          
          // If we have notes and no selection, select the first note
          if (sortedNotes.length > 0 && !selectedId) {
            handleNoteSelect(sortedNotes[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    };
    
    if (currentUser && currentUser.id) {
      loadNotes();
    }
  }, [currentUser]);

  useEffect(() => {
    const saveNotes = async () => {
      try {
        if (currentUser && notes.length > 0) { 
          await Promise.all(notes.map(note => 
            storageService.writeNote(note.id, note)
          ));
        }
      } catch (error) {
        console.error('Failed to save notes:', error);
      }
    };
    saveNotes();
  }, [notes, currentUser]);

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
          const childItems = notes.filter(note => note.parentFolderId === noteId);
          for (const childItem of childItems) {
            await storageService.deleteNote(childItem.id);
          }
        }
        await storageService.deleteNote(noteId);
        setNotes(prevNotes => 
          prevNotes.filter(note => 
            note.id !== noteId && 
            note.parentFolderId !== noteId
          )
        );
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

  const handleToggleSidebar = () => {
    if (appSidebarRef.current && appSidebarRef.current.toggleSidebar) {
      appSidebarRef.current.toggleSidebar();
    }
  };

  const handleLoginSuccess = (userData) => {
    console.log("Login success with userData:", userData);
    setCurrentUser(userData);
    setIsAuthenticated(true);
    setIsLocalMode(!!userData.localOnly);
    
    // Ensure user ID is set in storage service
    if (userData.id) {
      localStorage.setItem('currentUserId', userData.id.toString());
      storageService.setAuthToken(null, userData.id);
      // Set flag to auto-associate existing notes with this user
      storageService.setMigrateUnassociatedNotes(true);
      
      // Initialize sync service with the user ID
      syncService.setAuthToken(userData.id.toString());
    }
    
    debugUserState();
  };

  const handleLogout = async () => {
    try {
      if (!isLocalMode) {
        // Only call the server logout if we're not in local mode
        const response = await fetch('/api/logout/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          console.error('Server logout failed:', response.status);
        }
      }
      
      // Always clear local state
      localStorage.removeItem('currentUserId');
      storageService.clearAuthToken();
      syncService.setAuthToken(null); // Clear sync service auth token
      setCurrentUser(null);
      setIsAuthenticated(false);
      setIsLocalMode(false);
      setNotes([]);
      setSelectedId(null);
    } catch (error) {
      console.error('Logout failed:', error);
      
      // Even if server logout fails, clear local state
      localStorage.removeItem('currentUserId');
      storageService.clearAuthToken();
      syncService.setAuthToken(null); // Clear sync service auth token
      setCurrentUser(null);
      setIsAuthenticated(false);
      setIsLocalMode(false);
      setNotes([]);
      setSelectedId(null);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    if (selectedId) {
      const note = notes.find(note => note.id === selectedId);
      if (note) {
        const title = note.visibleTitle || noteContentService.getFirstLine(note.content) || 'untitled';
        const slug = title.toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 100);
        let folderPath = '';
        let currentFolderId = note.parentFolderId;
        if (currentFolderId) {
          const folderPathSegments = [];
          while (currentFolderId) {
            const folder = notes.find(n => n.id === currentFolderId);
            if (!folder) break;
            const folderName = folder.visibleTitle || noteContentService.getFirstLine(folder.content) || 'folder';
            const folderSlug = folderName.toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-');
            folderPathSegments.unshift(folderSlug);
            currentFolderId = folder.parentFolderId;
          }
          folderPath = folderPathSegments.join('/');
          if (folderPath) folderPath += '/';
        }
        const urlSlug = (slug && slug !== 'untitled') ? `${slug}` : 'untitled';
        window.history.pushState({ noteId: selectedId }, '', `/${folderPath}${urlSlug}#${selectedId}`);
      }
    } else {
      window.history.pushState({}, '', '/');
    }
  }, [selectedId, notes, currentUser]);

  useEffect(() => {
    const handlePopState = (event) => {
      if (!currentUser) return;
      if (event.state && event.state.noteId) {
        setSelectedId(event.state.noteId);
        noteNavigation.push(event.state.noteId);
      } else {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#')) {
          const noteId = parseInt(hash.substring(1));
          if (!isNaN(noteId) && notes.some(note => note.id === noteId)) {
            setSelectedId(noteId);
            noteNavigation.push(noteId);
            return;
          }
        }
        const pathname = window.location.pathname;
        if (pathname && pathname !== '/') {
          const path = pathname.replace(/^\/|\/$/g, '');
          const segments = path.split('/');
          const lastSegment = segments[segments.length - 1];
          let matchedNote = null;
          if (lastSegment === 'untitled' && hash && hash.startsWith('#')) {
            const noteId = parseInt(hash.substring(1));
            if (!isNaN(noteId)) {
              const untitledNote = notes.find(note => note.id === noteId);
              if (untitledNote) {
                setSelectedId(noteId);
                noteNavigation.push(noteId);
                return;
              }
            }
          }
          for (const note of notes) {
            const title = note.visibleTitle || noteContentService.getFirstLine(note.content) || '';
            const noteSlug = title.toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-');
            if (noteSlug === lastSegment) {
              matchedNote = note;
              if (segments.length > 1 && note.parentFolderId) {
                let currentFolderId = note.parentFolderId;
                let matchesPath = true;
                for (let i = segments.length - 2; i >= 0; i--) {
                  const folder = notes.find(n => n.id === currentFolderId);
                  if (!folder) { matchesPath = false; break; }
                  const folderName = folder.visibleTitle || noteContentService.getFirstLine(folder.content) || 'folder';
                  const folderSlug = folderName.toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-');
                  if (folderSlug !== segments[i]) { matchesPath = false; break; }
                  currentFolderId = folder.parentFolderId;
                }
                if (!matchesPath) { matchedNote = null; continue; }
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
    if (currentUser) handlePopState({ state: history.state });
    return () => window.removeEventListener('popstate', handlePopState);
  }, [notes, currentUser]);

  // Add a loading timeout
  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        console.log("Forcing loading state to complete after timeout");
        setIsLoading(false);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  // Add effect to synchronize folder data on app load
  useEffect(() => {
    // Check if user is authenticated
    const currentUserId = localStorage.getItem('currentUserId');
    if (currentUserId) {
      // Force refresh of notes from server on app load
      console.log('App mounted - refreshing folder data from server');
      syncService.fetchNotesFromBackend().then(({ success, notes }) => {
        if (success && notes && notes.length > 0) {
          // Filter for folders
          const folders = notes.filter(note => note.type === 'folder');
          if (folders.length > 0) {
            console.log(`Refreshing ${folders.length} folders from server`);
            // Notes have already been saved by fetchNotesFromBackend
            // Just trigger a UI refresh
            window.dispatchEvent(new CustomEvent('foldersUpdated'));
          }
        }
      }).catch(error => {
        console.error('Error refreshing folders on app load:', error);
      });
    }
  }, []);

  // Set up periodic background refresh to keep content in sync across devices/tabs
  useEffect(() => {
    // Check if user is authenticated
    const currentUserId = localStorage.getItem('currentUserId');
    if (!currentUserId) return;
    
    console.log('Setting up periodic background refresh...');
    
    // Check for updates every 30 seconds in the background
    const refreshInterval = setInterval(async () => {
      // Skip if WebSocket is connected (it will handle updates)
      if (syncService.isWebSocketConnected) return;
      
      // Skip if page is not visible to conserve resources
      if (document.visibilityState !== 'visible') return;
      
      try {
        // Check for changes since last update
        const hasChanges = await syncService.fetchLatestChanges();
        if (hasChanges) {
          console.log('Background refresh found and applied updates');
        }
      } catch (error) {
        console.error('Background refresh error:', error);
      }
    }, 30000); // 30 seconds
    
    // Clean up interval on unmount
    return () => clearInterval(refreshInterval);
  }, []);

  if (isLoading) {
    return (
      <div className="loading-container" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div>Loading application...</div>
        <button onClick={() => setIsLoading(false)} style={{
          padding: '8px 16px',
          background: '#4a90e2',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Skip Loading
        </button>
      </div>
    );
  }

  return (
    <Router>
      {isLocalMode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: '#ff9800',
          color: 'white',
          textAlign: 'center',
          padding: '4px',
          zIndex: 9999,
          fontSize: '14px'
        }}>
          Local Mode - Server Unavailable
        </div>
      )}
      <Routes>
        <Route
          path="/auth"
          element={
            !isAuthenticated ? (
              <AuthPage onLoginSuccess={handleLoginSuccess} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <MainAppLayout 
                currentUser={currentUser} 
                onLogout={handleLogout}
                isSettingsOpen={isSettingsOpen} setIsSettingsOpen={setIsSettingsOpen}
                selectedId={selectedId} handleNoteSelect={handleNoteSelect}
                gifToAdd={gifToAdd} setGifToAdd={setGifToAdd}
                notes={notes} setNotes={setNotes}
                isGifModalOpen={isGifModalOpen} setIsGifModalOpen={setIsGifModalOpen}
                isPdfExportModalOpen={isPdfExportModalOpen} setIsPdfExportModalOpen={setIsPdfExportModalOpen}
                pdfExportNote={pdfExportNote} setPdfExportNote={setPdfExportNote}
                isRenameModalOpen={isRenameModalOpen} setRenameModalOpen={setRenameModalOpen}
                itemToRename={itemToRename} setItemToRename={setItemToRename}
                togglePin={togglePin}
                deleteNote={deleteNote}
                handleBack={handleBack}
                handleGifModalOpen={handleGifModalOpen}
                handleAddGif={handleAddGif}
                updateNote={updateNote}
                handleToggleSidebar={handleToggleSidebar}
                appSidebarRef={appSidebarRef}
                isLocalMode={isLocalMode}
              />
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;