import React, { useState, useCallback, useMemo, useRef, useEffect, useImperativeHandle } from 'react';
import { SquarePen, Pin, Lock } from 'lucide-react';
import InfoMenu from './InfoMenu';
import { noteContentService } from '../utils/NoteContentService';
import logo from '../assets/logo.png';
import { storageService } from '../utils/StorageService';
import { noteUpdateService } from '../utils/NoteUpdateService';

// Memoized individual note item component
const NoteItem = React.memo(({
  note, 
  isSelected, 
  onNoteSelect, 
  onContextMenu,
}) => {
  const title = useMemo(() => {
    if (note.locked && note.visibleTitle) {
      return note.visibleTitle;
    }
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
const Sidebar = React.forwardRef(({
  selectedId,
  onNoteSelect,
  notes,
  setNotes,
  onUnlockNote,
  onTogglePin,
  onDeleteNote,
  gifToAdd,
  onGifAdded,
  downloadNoteId,
  isDownloadable,
  setDownloadable,
  setDownloadNoteId,
  setPdfExportNote,
  setIsPdfExportModalOpen
}, ref) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280); // Default width
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarRef = useRef(null);
  const resizeHandleRef = useRef(null);

  const MIN_WIDTH = 280;
  const MAX_WIDTH_PERCENTAGE = 75;

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      const maxWidth = (window.innerWidth * MAX_WIDTH_PERCENTAGE) / 100;
      const newWidth = Math.max(0, Math.min(e.clientX, maxWidth));
      
      // Get all elements that need updating
      const sidebar = document.querySelector('.sidebar');
      const mainContent = document.querySelector('.main-content');
      const topBar = document.querySelector('.top-bar');
      const header = document.querySelector('header');
      
      if (sidebar && mainContent && header && topBar) {
        
        if (newWidth < MIN_WIDTH / 2) {
          // Full collapse
          setIsCollapsed(true);
          console.log(isCollapsed)
          setSidebarWidth(0);
          sidebar.classList.add('hidden');
          mainContent.classList.add('full-width');
          topBar.classList.add('full-width');
          header.classList.add('full-width');
          
          // Reset positions for collapsed state
          header.style.left = '0px';
          topBar.style.width = '100%';
          mainContent.style.width = '100%';
        } else {
          // If we were previously collapsed, add opening transitions
          // This lowkey sucks but it is better than not having it imo
          // if (newWidth < MIN_WIDTH) {
          //   mainContent.classList.add('opening');
          //   topBar.classList.add('opening');
          //   header.classList.add('opening');
            
          //   setTimeout(() => {
          //     mainContent.classList.remove('opening');
          //     topBar.classList.remove('opening');
          //     header.classList.remove('opening');
          //   }, 300);
          // }
          
          // Apply MIN_WIDTH constraint
          const effectiveWidth = Math.max(MIN_WIDTH, newWidth);
          
          // Remove collapse classes
          sidebar.classList.remove('hidden');
          mainContent.classList.remove('full-width');
          topBar.classList.remove('full-width');
          header.classList.remove('full-width');
          
          // Update all elements with the constrained width
          // console.log("setting to false")
          setIsCollapsed(false);
          setSidebarWidth(effectiveWidth);
          header.style.left = `${effectiveWidth}px`;
          topBar.style.width = `calc(100% - ${effectiveWidth}px)`;
          mainContent.style.width = `calc(100% - ${effectiveWidth}px)`;
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    document.body.style.cursor = 'ew-resize';
  };

  useImperativeHandle(ref, () => ({
    toggleSidebar: () => {
      const sidebar = document.querySelector('.sidebar');
      const mainContent = document.querySelector('.main-content');
      const topBar = document.querySelector('.top-bar');
      const header = document.querySelector('header');
      
      if (isCollapsed) {
        setIsCollapsed(false);
        setSidebarWidth(MIN_WIDTH);
        
        if (sidebar && mainContent && header && topBar) {
          sidebar.classList.remove('hidden');
          mainContent.classList.remove('full-width');
          topBar.classList.remove('full-width');
          header.classList.remove('full-width');
          
          // Add opening class for transition
          sidebar.classList.add('opening');
          mainContent.classList.add('opening');
          topBar.classList.add('opening');
          header.classList.add('opening');
          
          // Update positions
          header.style.left = `${MIN_WIDTH}px`;
          topBar.style.width = `calc(100% - ${MIN_WIDTH}px)`;
          mainContent.style.width = `calc(100% - ${MIN_WIDTH}px)`;
          
          // Remove opening class after transition completes
          setTimeout(() => {
            sidebar.classList.remove('opening');
            mainContent.classList.remove('opening');
            topBar.classList.remove('opening');
            header.classList.remove('opening');
          }, 300);
        }
      } else {
        setIsCollapsed(true);
        setSidebarWidth(0);
        
        if (sidebar && mainContent && header && topBar) {
          sidebar.classList.add('hidden');
          mainContent.classList.add('full-width');
          topBar.classList.add('full-width');
          header.classList.add('full-width');
          
          // Reset positions
          header.style.left = '0px';
          topBar.style.width = '100%';
          mainContent.style.width = '100%';
        }
      }
    }
  }));

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

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


    // Subscribe to updates
    useEffect(() => {
      const unsubscribe = noteUpdateService.subscribe((updatedNote) => {
        setNotes(prevNotes => {
          const updatedNotes = prevNotes.map(note =>
            note.id === updatedNote.id ? updatedNote : note
          );
          return sortNotes(updatedNotes);
        });
      });
    
      return () => unsubscribe();
    }, []);
  // Filter notes based on search term
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      if (!searchTerm) return true;
      const title = note.locked && note.visibleTitle 
        ? note.visibleTitle 
        : noteContentService.getFirstLine(note.content);
      return title.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [notes, searchTerm]);

  return (
    <div 
      ref={sidebarRef}
      className={`sidebar`} // ${isCollapsed ? 'hidden' : ''}
      id="sidebar"
      style={{ 
        width: isCollapsed ? 280 : sidebarWidth,
        minWidth: isCollapsed ? 250 : MIN_WIDTH,
      }}
    >
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
      
      <ul className="note-list">
        {filteredNotes.map(note => (
          <NoteItem
            key={note.id}
            note={note}
            isSelected={note.id === selectedId}
            onNoteSelect={onNoteSelect}
            onContextMenu={handleContextMenu}
          />
        ))}
      </ul>

      {/* Resize Handle */}
      <div
        ref={resizeHandleRef}
        className="resize-handle"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '4px',
          height: '100%',
          cursor: 'ew-resize',
          background: 'rgba(0, 0, 0, 0.1)',
          opacity: isResizing ? 1 : 0,
          transition: 'opacity 0.2s ease',
          zIndex: 1000
        }}
      />

      {contextMenu && (
        <InfoMenu
          selectedId={contextMenu.noteId}
          notes={notes}
          onTogglePin={onTogglePin}
          onDeleteNote={onDeleteNote}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          downloadNoteId={downloadNoteId}
          isDownloadable={isDownloadable}
          setDownloadable={setDownloadable}
          setDownloadNoteId={setDownloadNoteId}
          setPdfExportNote={setPdfExportNote}
          setIsPdfExportModalOpen={setIsPdfExportModalOpen}
        />
      )}
    </div>
  );
})

export default React.memo(Sidebar);