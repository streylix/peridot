import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, ArrowUp, ArrowDown, Search, XCircle } from 'lucide-react';
import { syncService } from '../utils/SyncService';
import { noteContentService } from '../utils/NoteContentService';
import { storageService } from '../utils/StorageService';
import SyncBar from './SyncBar';
import { ItemPresets } from './Modal';

const SyncSection = ({ onNoteSelect, onClose }) => {
  const [syncedNotes, setSyncedNotes] = useState([]);
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoSync, setAutoSync] = useState(() => 
    localStorage.getItem('autoSyncEnabled') === 'true'
  );
  const [sortConfig, setSortConfig] = useState({
    key: 'lastSynced',
    direction: 'desc'
  });

  useEffect(() => {
    const loadSyncedNotes = async () => {
      setIsLoading(true);
      try {
        const notes = syncService.getAllSyncedNotes();
        
        // Fetch actual note data for each synced note
        const notesWithData = await Promise.all(
          notes.map(async (syncedNote) => {
            try {
              const noteData = await storageService.readNote(syncedNote.id);
              return {
                ...syncedNote,
                title: noteData ? (noteData.visibleTitle || noteContentService.getFirstLine(noteData.content)) : 'Untitled'
              };
            } catch (error) {
              console.error(`Failed to load note ${syncedNote.id}:`, error);
              return {
                ...syncedNote,
                title: 'Untitled'
              };
            }
          })
        );
        
        setSyncedNotes(notesWithData);
        setFilteredNotes(notesWithData);
      } catch (error) {
        console.error('Failed to load synced notes:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSyncedNotes();

    // Subscribe to sync status changes
    const unsubscribe = syncService.subscribe(() => {
      loadSyncedNotes();
    });

    return () => {
      unsubscribe();
    };
  }, []);

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

  useEffect(() => {
    // Sort notes based on sortConfig
    const sortedNotes = [...filteredNotes].sort((a, b) => {
      if (sortConfig.key === 'size') {
        // Size is a numeric value - Fix the sort direction
        return sortConfig.direction === 'desc' 
          ? a.size - b.size 
          : b.size - a.size;
      } else if (sortConfig.key === 'lastSynced') {
        // Date sorting - Fix the sort direction
        const dateA = a.lastSynced ? new Date(a.lastSynced) : new Date(0);
        const dateB = b.lastSynced ? new Date(b.lastSynced) : new Date(0);
        return sortConfig.direction === 'desc' 
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

  const handleAutoSyncChange = (e) => {
    const newValue = e.target.checked;
    setAutoSync(newValue);
    localStorage.setItem('autoSyncEnabled', newValue);
    syncService.setAutoSync(newValue);
  };

  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

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
    if (window.confirm('Are you sure you want to remove this note from sync?')) {
      await syncService.removeFromSync(noteId);
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

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    
    return sortConfig.direction === 'asc' 
      ? <ArrowUp size={14} className="sort-icon" /> 
      : <ArrowDown size={14} className="sort-icon" />;
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  return (
    <div className="sync-section">
      <div className="sync-header">
        <h3>Cloud Sync</h3>
        <p>Sync your notes to the cloud for access across devices</p>
        <SyncBar />
      </div>

      <div className="auto-sync-option">
        <ItemPresets.TEXT_SWITCH
          label="Auto-sync notes when changed"
          subtext="Automatically sync notes whenever they're modified"
          value={autoSync}
          onChange={handleAutoSyncChange}
        />
      </div>

      <div className="sync-notes-table">
        <div className="sync-table-header">
          <h4>Synced Notes</h4>
          <div className="search-container">
            <div className="search-input-wrapper">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button 
                  className="clear-search-button" 
                  onClick={handleClearSearch}
                  title="Clear search"
                >
                  <XCircle size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        {isLoading ? (
          <div className="sync-loading">Loading synced notes...</div>
        ) : filteredNotes.length === 0 ? (
          <div className="sync-empty">
            {searchTerm ? 'No matching notes found.' : 'No synced notes found. Right-click on a note to sync it.'}
          </div>
        ) : (
          <table className="sync-table">
            <thead>
              <tr>
                <th 
                  className="sortable-header"
                  onClick={() => handleSort('title')}
                >
                  <div className="header-content">
                    Note {renderSortIcon('title')}
                  </div>
                </th>
                <th 
                  className="sortable-header"
                  onClick={() => handleSort('lastSynced')}
                >
                  <div className="header-content">
                    Last Synced {renderSortIcon('lastSynced')}
                  </div>
                </th>
                <th 
                  className="sortable-header"
                  onClick={() => handleSort('size')}
                >
                  <div className="header-content">
                    Size {renderSortIcon('size')}
                  </div>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredNotes.map(note => (
                <tr key={note.id}>
                  <td>
                    <button
                      className="note-link"
                      onClick={() => handleOpenNote(note.id)}
                      title={note.title || 'Untitled'}
                    >
                      <span className="truncated-title">
                        {note.title || 'Untitled'}
                      </span>
                    </button>
                  </td>
                  <td>{formatDate(note.lastSynced)}</td>
                  <td>{formatSize(note.size)}</td>
                  <td>
                    <button
                      className="icon-button"
                      onClick={() => syncService.syncNote(note.id)}
                      title="Resync"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => handleRemoveFromSync(note.id)}
                      title="Remove from sync"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .sync-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .sync-header {
          margin-bottom: 16px;
        }
        
        .sync-header h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
        }
        
        .sync-header p {
          margin: 0 0 16px 0;
          color: #999;
          font-size: 14px;
        }
        
        .auto-sync-option {
          margin-bottom: 16px;
        }
        
        .sync-notes-table {
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }

        .sync-table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
          padding: 8px 12px;
        }
        
        .sync-table-header h4 {
          margin: 0;
          font-size: 16px;
        }

        .search-container {
          position: relative;
          min-width: 180px;
          width: 30%;
          max-width: 220px;
          margin-left: 8px;
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
          padding: 6px 30px 6px 30px;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
          font-size: 14px;
          background-color: #fff;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #0aa34f;
        }
        
        .dark-mode .search-input:focus {
          border-color: #1c7a43;
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
        
        .sync-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .sync-table th,
        .sync-table td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .sync-table th {
          background-color: #f5f5f5;
          font-weight: 500;
        }

        .sortable-header {
          cursor: pointer;
          user-select: none;
        }

        .sortable-header:hover {
          background-color: #eaeaea;
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .sort-icon {
          color: #0aa34f;
        }
        
        .sync-loading,
        .sync-empty {
          padding: 24px;
          text-align: center;
          color: #999;
        }
        
        .icon-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          margin-right: 4px;
          border-radius: 4px;
          color: #999;
          transition: background-color 0.2s, color 0.2s;
        }
        
        .icon-button:hover {
          background-color: #f0f0f0;
          color: #333;
        }

        .note-link {
          background: none;
          border: none;
          padding: 0;
          font-family: inherit;
          font-size: inherit;
          color: #0aa34f;
          cursor: pointer;
          text-align: left;
          text-decoration: none;
          display: block;
          width: 100%;
        }

        .note-link:hover {
          text-decoration: underline;
        }

        .truncated-title {
          display: inline-block;
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        /* Dark mode styles */
        .dark-mode .sync-notes-table {
          border-color: #404040;
        }
        
        .dark-mode .sync-table-header {
          background-color: #1f1f1f;
          border-bottom-color: #404040;
        }

        .dark-mode .search-input {
          background-color: #2a2a2a;
          border-color: #404040;
          color: #fff;
        }
        
        .dark-mode .sync-table th,
        .dark-mode .sync-table td {
          border-bottom-color: #404040;
        }
        
        .dark-mode .sync-table th {
          background-color: #1f1f1f;
        }

        .dark-mode .sortable-header:hover {
          background-color: #2a2a2a;
        }

        .dark-mode .note-link {
          color: #1c7a43;
        }
        
        .dark-mode .icon-button:hover {
          background-color: #323232;
          color: #ffffff;
        }
      `}</style>
    </div>
  );
};

export default SyncSection; 