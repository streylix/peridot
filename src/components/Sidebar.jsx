import React, { useState, useCallback, useMemo } from 'react';
import { SquarePen, Pin, Lock } from 'lucide-react';
import MainContent from './MainContent';
import InfoMenu from './InfoMenu';
import { noteContentService } from '../utils/NoteContentService';
import logo from '../assets/logo.png';
import { storageService } from '../utils/StorageService';

// Memoized individual note item component
const NoteItem = React.memo(({
  note, 
  isSelected, 
  onNoteSelect, 
  onContextMenu,
}) => {
  const title = useMemo(() => {
    // If the note is locked, use the stored visible title
    if (note.locked && note.visibleTitle) {
      return note.visibleTitle;
    }
    // Otherwise get the first line of content
    return noteContentService.getFirstLine(note.content);
  }, [note.content, note.locked, note.visibleTitle]);

  const preview = useMemo(() => {
    if (note.locked) {
      return 'Unlock to view';
    }
    return noteContentService.getPreviewContent(note.content);
  }, [note.content, note.locked]);

  const handleClick = useCallback(() => {
    onNoteSelect(note.id);
  }, [note.id, onNoteSelect]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    onContextMenu(e, note.id);
  }, [note.id, onContextMenu]);

  return (
    <li
      className={`note-item ${isSelected ? 'active' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="note-header">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="note-title">{title}</span>
          <div className="note-preview">{preview}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {note.pinned && <Pin size={20} className="pin-indicator" />}
          {note.locked && <Lock size={20} className="lock-indicator" />}
        </div>
      </div>
    </li>
  );
});

// Memoized note list component
const NoteList = React.memo(({ 
  notes, 
  searchTerm, 
  selectedId, 
  onNoteSelect, 
  onContextMenu 
}) => {
  // Memoize filtered and sorted notes
  const filteredAndSortedNotes = useMemo(() => {
    return notes
      .filter(note => {
        if (!searchTerm) return true;
        const content = note.content.toLowerCase();
        const search = searchTerm.toLowerCase();
        return content.includes(search);
      })
      .sort((a, b) => {
        // First sort by pinned status
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Then by modification date
        return new Date(b.dateModified) - new Date(a.dateModified);
      });
  }, [notes, searchTerm]);

  return (
    <ul className="note-list">
      {filteredAndSortedNotes.map(note => (
        <NoteItem
          key={note.id}
          note={note}
          isSelected={note.id === selectedId}
          onNoteSelect={onNoteSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </ul>
  );
});

// Hook for search functionality
const useSearch = (initialValue = '') => {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  return [searchTerm, handleSearchChange];
};

// Main sidebar component
function Sidebar({ 
  selectedId, 
  onNoteSelect, 
  notes, 
  setNotes, 
  onUnlockNote,
  onTogglePin,
  onDeleteNote,
  onLockModalOpen,
  onUnlockModalOpen,
  onUpdateNote,
  gifToAdd,
  onGifAdded,
  onDownloadUnlockModalOpen,
  downloadNoteId,
  isDownloadable,
  setDownloadable,
  setDownloadNoteId,
  setPdfExportNote,
  setIsPdfExportModalOpen,
}) {
  const [searchTerm, handleSearchChange] = useSearch('');
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = useCallback((e, noteId) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      noteId
    });
  }, []);

  const createNewNote = async () => {
    const newNote = {
      id: Date.now(),
      content: '',
      dateModified: new Date().toISOString(),
      pinned: false,
      caretPosition: 0
    };

    try {
      await storageService.writeNote(newNote.id, newNote);
      setNotes(prevNotes => sortNotes([newNote, ...prevNotes]));
      onNoteSelect(newNote.id);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const sortNotes = useCallback((notesToSort) => {
    return notesToSort.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.dateModified) - new Date(a.dateModified);
    });
  }, []);

  
  const updateNote = async (updates, updateModified = true) => {
    setNotes(prevNotes => {
      const updatedNotes = prevNotes.map(note => {
        if (note.id === selectedId) {
          // Only include encryption-related fields if the note is actually locked
          const updatedNote = {
            ...note,
            ...updates,
            dateModified: updateModified ? new Date().toISOString() : note.dateModified
          };

          // If the note was not locked before and updates don't specify locking,
          // remove encryption-related fields
          if (!note.locked && !updates.locked) {
            delete updatedNote.encrypted;
            delete updatedNote.keyParams;
            delete updatedNote.iv;
            delete updatedNote.visibleTitle;
          }

          return updatedNote;
        }
        return note;
      });

      // Save notes to storage
      updatedNotes.forEach(async note => {
        try {
          await storageService.writeNote(note.id, note);
        } catch (error) {
          console.error('Failed to save note:', error);
        }
      });

      return sortNotes(updatedNotes);
    });
  };

  return (
    <>
      <div className="sidebar" id="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <img src={logo} alt="biz logo" width="50" height="50" />
            <h1>peridot.</h1>
          </div>
          <div className="search">
            <input
              type="search"
              id="note-search"
              placeholder="Search..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <button 
              type="button" 
              className="new-note-btn"
              onClick={createNewNote}
              title="New Note"
            >
              <SquarePen />
            </button>
          </div>
        </div>
        
        <NoteList
          notes={notes}
          searchTerm={searchTerm}
          selectedId={selectedId}
          onNoteSelect={onNoteSelect}
          onContextMenu={handleContextMenu}
        />

        {contextMenu && (
          <InfoMenu
            selectedId={contextMenu.noteId}
            notes={notes}
            onTogglePin={onTogglePin}
            onDeleteNote={onDeleteNote}
            onLockModalOpen={onLockModalOpen}
            onUnlockModalOpen={onUnlockModalOpen}
            onDownloadUnlockModalOpen={onDownloadUnlockModalOpen}
            position={contextMenu}
            onClose={() => setContextMenu(null)}
            onUpdateNote={updateNote}
            downloadNoteId={downloadNoteId}
            isDownloadable={isDownloadable}
            setDownloadable={setDownloadable}
            setDownloadNoteId={setDownloadNoteId}
            setPdfExportNote={setPdfExportNote}
            setIsPdfExportModalOpen={setIsPdfExportModalOpen}
          />
        )}
      </div>

      <MainContent 
        note={notes.find(note => note.id === selectedId)}
        onUpdateNote={updateNote}
        onUnlockNote={onUnlockNote}
        gifToAdd={gifToAdd}
        onGifAdded={onGifAdded}
      />
    </>
  );
}

export default React.memo(Sidebar);