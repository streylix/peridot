import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, RefreshCw, ArrowUp, ArrowDown, Search, XCircle, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { syncService } from '../utils/SyncService';
import { noteContentService } from '../utils/NoteContentService';
import { storageService } from '../utils/StorageService';
import SyncBar from './SyncBar';
import { ItemPresets, ItemComponents } from './Modal';

// Cache for backend notes to prevent excessive API calls, but with shorter lifetime with webhooks
let notesCache = null;
let lastNotesFetchTime = 0;
const NOTES_CACHE_DURATION = 30000; // 30 seconds cache for better responsiveness

const SyncSection = ({ onNoteSelect, onClose, currentUser }) => {
  const [syncedNotes, setSyncedNotes] = useState([]);
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Keep only the sync all loading state
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'lastSynced',
    direction: 'desc'
  });
  // Status message state
  const [statusMessage, setStatusMessage] = useState(null);

  // Refs for cleanup and debouncing
  const isComponentMounted = useRef(true);
  const updateTimeoutRef = useRef(null);

  // Make sure sync service has the current user ID
  useEffect(() => {
    if (currentUser && currentUser.id) {
      console.log("SyncSection: Setting user ID in sync service:", currentUser.id);
      syncService.setAuthToken(currentUser.id.toString());
      
      // Clear notes cache when user changes to force a fresh load
      notesCache = null;
      lastNotesFetchTime = 0;
      
      // Reset state
      setSyncedNotes([]);
      setFilteredNotes([]);
      setIsLoading(true);
      
      // Load notes for the new user
      loadNotesFromBackend(true, true);
    }
  }, [currentUser]);

  // Function to set a temporary status message
  const showStatusMessage = (message, type = 'info', duration = 5000) => {
    if (!isComponentMounted.current) return;
    
    setStatusMessage({ text: message, type });
    if (duration) {
      setTimeout(() => {
        if (isComponentMounted.current) {
          setStatusMessage(null);
        }
      }, duration);
    }
  };

  // Function to load notes directly from backend with caching
  const loadNotesFromBackend = useCallback(async (showLoader = true, bypassCache = false) => {
    if (showLoader) {
      setIsLoading(true);
    }
    
    try {
      // Cache is useful even with WebSockets to prevent too many refreshes on rapid changes
      // But with shorter duration than before
      const now = Date.now();
      if (!bypassCache && notesCache && now - lastNotesFetchTime < NOTES_CACHE_DURATION) {
        // Use cached notes
        if (isComponentMounted.current) {
          setSyncedNotes(notesCache);
          
          // Apply current search filter
          if (!searchTerm.trim()) {
            setFilteredNotes(notesCache);
          } else {
            const term = searchTerm.toLowerCase();
            const filtered = notesCache.filter(note => 
              note.title.toLowerCase().includes(term)
            );
            setFilteredNotes(filtered);
          }
        }
        return notesCache;
      }
      
      // Get notes directly from backend
      const backendNotes = await syncService.getNotesFromBackend();
        
        // Fetch actual note data for each synced note
        const notesWithData = await Promise.all(
        backendNotes.map(async (note) => {
            try {
            // Check if note exists locally
            const noteData = await storageService.readNote(note.id);
            
            if (noteData) {
              return {
                ...note,
                id: note.id,
                title: noteData.visibleTitle || noteContentService.getFirstLine(noteData.content) || 'Untitled',
                status: 'synced',
                lastSynced: syncService.getSyncStatus(note.id).lastSynced || new Date().toISOString(),
                size: syncService.getSyncStatus(note.id).size || 0
              };
            } else {
              // Note exists on backend but not locally, use backend data
              return {
                ...note,
                id: note.id,
                title: note.visibleTitle || noteContentService.getFirstLine(note.content) || 'Untitled',
                status: 'synced',
                lastSynced: syncService.getSyncStatus(note.id).lastSynced || new Date().toISOString(),
                size: syncService.getSyncStatus(note.id).size || 0
              };
            }
          } catch (error) {
            console.error(`Failed to load note ${note.id}:`, error);
            return {
              id: note.id,
              title: note.visibleTitle || 'Untitled',
              status: 'synced',
              lastSynced: syncService.getSyncStatus(note.id).lastSynced || new Date().toISOString(),
              size: syncService.getSyncStatus(note.id).size || 0
              };
            }
          })
        );
        
      // Update cache
      notesCache = notesWithData;
      lastNotesFetchTime = now;
      
      if (isComponentMounted.current) {
        setSyncedNotes(notesWithData);
        
        // Apply current search filter
        if (!searchTerm.trim()) {
        setFilteredNotes(notesWithData);
        } else {
          const term = searchTerm.toLowerCase();
          const filtered = notesWithData.filter(note => 
            note.title.toLowerCase().includes(term)
          );
          setFilteredNotes(filtered);
        }
      }
      
      return notesWithData;
      } catch (error) {
      console.error('Failed to load notes from backend:', error);
      showStatusMessage('Failed to load notes: ' + error.message, 'error');
      return [];
      } finally {
      if (showLoader && isComponentMounted.current) {
        setIsLoading(false);
      }
    }
  }, [searchTerm]);

  // Initial load of notes from backend
  useEffect(() => {
    // Set mounted flag
    isComponentMounted.current = true;
    
    // Load notes when user is available
    if (currentUser && currentUser.id) {
      loadNotesFromBackend();
    }
    
    // Cleanup on unmount
    return () => {
      isComponentMounted.current = false;
    };
  }, [currentUser, loadNotesFromBackend]);

  // Subscribe to sync status changes to update note list - debounce less aggressively
  // since WebSockets will already reduce the number of updates
  useEffect(() => {
    // Debounced handler for sync updates with shorter delay
    const handleSyncUpdates = () => {
      // Clear any existing timeout to prevent race conditions
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      // Set a small delay to debounce multiple rapid changes - shorter for WebSockets
      updateTimeoutRef.current = setTimeout(() => {
        if (isComponentMounted.current) {
          // Refresh notes list without showing loading indicator
          loadNotesFromBackend(false);
        }
      }, 100); // Reduced from 300ms to 100ms for better responsiveness
    };

    // Subscribe to sync status changes
    const unsubscribe = syncService.subscribe(handleSyncUpdates);

    // Cleanup function
    return () => {
      unsubscribe();
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [loadNotesFromBackend]);

  useEffect(() => {
    // Filter notes based on search term
    if (!searchTerm.trim()) {
      setFilteredNotes(syncedNotes);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = syncedNotes.filter(note => 
        note.title.toLowerCase().includes(term)
      );
      setFilteredNotes(filtered);
    }
  }, [searchTerm, syncedNotes]);

  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Apply sorting to notes
  useEffect(() => {
    const sortedNotes = [...filteredNotes].sort((a, b) => {
      if (sortConfig.key === 'size') {
        return sortConfig.direction === 'asc' 
          ? a.size - b.size 
          : b.size - a.size;
      } else if (sortConfig.key === 'lastSynced') {
        const dateA = a.lastSynced ? new Date(a.lastSynced) : new Date(0);
        const dateB = b.lastSynced ? new Date(b.lastSynced) : new Date(0);
        return sortConfig.direction === 'asc' 
          ? dateA - dateB 
          : dateB - dateA;
      } else {
        // Title sorting (string comparison)
        const valueA = a[sortConfig.key] || '';
        const valueB = b[sortConfig.key] || '';
        return sortConfig.direction === 'asc'
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA);
      }
    });
    
    setFilteredNotes(sortedNotes);
  }, [sortConfig]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleRemoveFromSync = async (noteId) => {
    try {
      showStatusMessage(`Removing note from sync...`, 'info');
      await syncService.removeFromSync(noteId);
      
      // Force cache refresh
      notesCache = null;
      
      // Update the list after removal
      await loadNotesFromBackend(false, true);
      
      showStatusMessage(`Note removed from sync`, 'success');
    } catch (error) {
      showStatusMessage(`Failed to remove note from sync: ${error.message}`, 'error');
    }
  };

  const handleOpenNote = (noteId) => {
    if (onNoteSelect && onClose) {
      // First select the note
      onNoteSelect(noteId);
      
      // Wait for the note selection to complete before closing the settings
      setTimeout(() => {
        onClose();
        
        // Ensure we close the modal and navigate to the note
        setTimeout(() => {
          // Focus on the note content area to ensure it's visible
          const noteContentElement = document.querySelector('.editor-container');
          if (noteContentElement) {
            noteContentElement.focus();
          }
        }, 100);
      }, 100);
    }
  };

  const handleSyncAllNotes = async () => {
    try {
      // Use dedicated loading state for this operation
      setIsSyncingAll(true);
      
      // Sync notes from local to server only (no need to fetch first with webhooks)
      showStatusMessage(`Syncing local notes to server...`, 'info');
      const result = await syncService.syncAllNotes();
      
      if (result.success) {
        showStatusMessage(`Sync complete! ${result.results.succeeded} succeeded, ${result.results.failed} failed, ${result.results.skipped} already synced.`, 'success');
        
        // Force cache refresh
        notesCache = null;
        
        // Refresh the notes list after syncing
        await loadNotesFromBackend(false, true);
      } else {
        showStatusMessage(`Sync failed: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Error syncing all notes:', error);
      showStatusMessage(`An error occurred: ${error.message}`, 'error');
    } finally {
      if (isComponentMounted.current) {
        setIsSyncingAll(false);
      }
    }
  };

  const handleSyncSingleNote = async (noteId) => {
    try {
      showStatusMessage(`Syncing note...`, 'info');
      await syncService.syncNote(noteId);
      
      // Force cache refresh
      notesCache = null;
      
      // Refresh the notes list after syncing one note
      await loadNotesFromBackend(false, true);
      
      showStatusMessage(`Note synced successfully`, 'success');
    } catch (error) {
      showStatusMessage(`Failed to sync note: ${error.message}`, 'error');
    }
  };

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="sort-icon" /> 
      : <ArrowDown size={14} className="sort-icon" />;
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  // Render the status icon for the status message
  const renderStatusIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle size={18} className="status-icon success" />;
      case 'error':
        return <AlertCircle size={18} className="status-icon error" />;
      case 'info':
      default:
        return <Info size={18} className="status-icon info" />;
    }
  };

  return (
    <div className="sync-section">
      <h2>Cloud Sync</h2>
        <p>Sync your notes to the cloud for access across devices</p>
      
      {/* Status message area */}
      {statusMessage && (
        <div className={`status-message ${statusMessage.type}`}>
          {renderStatusIcon(statusMessage.type)}
          <span>{statusMessage.text}</span>
        </div>
      )}
      
      <div className="sync-storage-info">
        <SyncBar />
      </div>

      <div className="sync-options">
        <div className="sync-button-container">
          <ItemPresets.TEXT_BUTTON
            label="Sync All Notes"
            subtext="Sync all local notes to the server for real-time updates across devices"
            buttonText={isSyncingAll ? "Syncing..." : "Sync All Notes"}
            onClick={handleSyncAllNotes}
            primary="true"
          />
        </div>
      </div>

      <div className="synced-notes-container">
        <h3>Synced Notes</h3>
        
          <div className="search-container">
            <div className="search-input-wrapper">
            <Search size={16} className="search-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search notes..."
                className="search-input"
              />
              {searchTerm && (
              <button className="clear-search-button" onClick={handleClearSearch}>
                <XCircle size={16} />
                </button>
              )}
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <div className="no-synced-notes">
        {isLoading ? (
              <div className="loading-indicator">Loading...</div>
            ) : (
              <>
                <p>No synced notes found. Use "Sync All Notes" button to sync your notes.</p>
              </>
            )}
          </div>
        ) : (
          <div className="synced-notes-table">
            <table>
            <thead>
              <tr>
                  <th onClick={() => handleSort('title')}>
                    Note {renderSortIcon('title')}
                </th>
                  <th onClick={() => handleSort('lastSynced')}>
                    Last Synced {renderSortIcon('lastSynced')}
                </th>
                  <th onClick={() => handleSort('size')}>
                    Size {renderSortIcon('size')}
                </th>
                  <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
                {filteredNotes.map((note) => (
                <tr key={note.id}>
                    <td 
                      className="note-title" 
                      onClick={() => handleOpenNote(note.id)}
                    >
                        {note.title || 'Untitled'}
                  </td>
                  <td>{formatDate(note.lastSynced)}</td>
                  <td>{formatSize(note.size)}</td>
                  <td>
                      <div className={`sync-status ${note.status}`}>
                        {note.status === 'synced' ? 'Synced' : 
                         note.status === 'syncing' ? 'Syncing...' : 
                         note.status === 'failed' ? 'Failed' : 'Not synced'}
                      </div>
                    </td>
                    <td>
                      <div className="note-actions">
                    <button
                          className="action-button refresh-icon"
                          onClick={() => handleSyncSingleNote(note.id)}
                          title="Sync this note"
                          disabled={note.status === 'syncing'}
                    >
                          <RefreshCw size={16} className={note.status === 'syncing' ? 'rotating' : ''} />
                    </button>
                    <button
                          className="action-button delete-icon"
                      onClick={() => handleRemoveFromSync(note.id)}
                      title="Remove from sync"
                          disabled={note.status === 'syncing'}
                    >
                      <Trash2 size={16} />
                    </button>
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .sync-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 0 10px;
        }
        
        h2 {
          margin-bottom: 4px;
          font-size: 20px;
        }
        
        p {
          margin: 0 0 16px 0;
          color: #999;
          font-size: 14px;
        }
        
        .sync-storage-info {
          margin: 10px 0;
        }
        
        .status-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        
        .status-message.success {
          background-color: rgba(10, 163, 79, 0.1);
          color: #0aa34f;
          border-left: 3px solid #0aa34f;
        }
        
        .status-message.error {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-left: 3px solid #ef4444;
        }
        
        .status-message.info {
          background-color: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          border-left: 3px solid #3b82f6;
        }
        
        .status-icon.success {
          color: #0aa34f;
        }
        
        .status-icon.error {
          color: #ef4444;
        }
        
        .status-icon.info {
          color: #3b82f6;
        }

        .sync-button-container {
          display: flex;
          gap: 10px;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        
        .synced-notes-container {
          margin-top: 10px;
        }
        
        .synced-notes-container h3 {
          font-size: 16px;
          margin-bottom: 12px;
        }

        .search-container {
          margin-bottom: 12px;
        }

        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 8px;
          color: #999;
        }

        .search-input {
          width: 100%;
          padding: 8px 30px 8px 30px;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
          font-size: 14px;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #0aa34f;
        }

        .clear-search-button {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: #999;
        }

        .clear-search-button:hover {
          color: #666;
        }
        
        .no-synced-notes {
          text-align: center;
          padding: 30px 0;
          color: #999;
        }
        
        .loading-indicator {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          font-style: italic;
          color: #999;
        }
        
        .synced-notes-table {
          width: 100%;
          overflow-x: auto;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
        }
        
        th, td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid #e0e0e0;
          font-size: 14px;
        }
        
        th {
          font-weight: 500;
          cursor: pointer;
          user-select: none;
          color: #666;
        }

        th:hover {
          background-color: #f5f5f5;
        }

        .note-title {
          cursor: pointer;
          color: #0aa34f;
          font-weight: 500;
        }
        
        .note-title:hover {
          text-decoration: underline;
        }
        
        .note-actions {
          display: flex;
          gap: 8px;
        }
        
        .action-button {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }
        
        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .refresh-icon {
          color: #4a90e2;
        }
        
        .refresh-icon:hover:not(:disabled) {
          background-color: rgba(74, 144, 226, 0.1);
        }
        
        .delete-icon {
          color: #ef4444;
        }

        .delete-icon:hover:not(:disabled) {
          background-color: rgba(239, 68, 68, 0.1);
        }
        
        /* Add rotation animation for refresh icon */
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .rotating {
          animation: rotate 1.5s linear infinite;
        }

        .sync-status {
          font-size: 12px;
          padding: 2px 6px;
          border-radius: 10px;
          display: inline-block;
          text-align: center;
        }
        
        .sync-status.synced {
          background-color: rgba(10, 163, 79, 0.1);
          color: #0aa34f;
        }
        
        .sync-status.syncing {
          background-color: rgba(234, 179, 8, 0.1);
          color: #eab308;
        }
        
        .sync-status.failed {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
        
        .sync-status.not-synced {
          background-color: rgba(107, 114, 128, 0.1);
          color: #6b7280;
        }
        
        /* Dark mode styles */
        .dark-mode .status-message.success {
          background-color: rgba(10, 163, 79, 0.2);
        }
        
        .dark-mode .status-message.error {
          background-color: rgba(239, 68, 68, 0.2);
        }
        
        .dark-mode .status-message.info {
          background-color: rgba(59, 130, 246, 0.2);
        }

        .dark-mode .search-input {
          background-color: #2a2a2a;
          border-color: #404040;
          color: #fff;
        }
        
        .dark-mode th:hover {
          background-color: #2a2a2a;
        }

        .dark-mode th, 
        .dark-mode td {
          border-bottom-color: #404040;
        }
      `}</style>
    </div>
  );
};

export default SyncSection; 