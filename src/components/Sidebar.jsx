import React, { useState, useCallback, useMemo, useRef, useEffect, useImperativeHandle } from 'react';
import { SquarePen, FolderPlus } from 'lucide-react';
import NoteItem from './NoteItem';
import InfoMenu from './InfoMenu';
import { noteContentService } from '../utils/NoteContentService';
import logo2 from '../assets/logo2.png';
import { storageService } from '../utils/StorageService';
import { noteUpdateService } from '../utils/NoteUpdateService';
import { noteSortingService } from '../utils/NoteSortingService';
import SortingButton from './SortingButton';
import { noteImportExportService } from '../utils/NoteImportExportService';

const CustomTooltip = ({ children, content }) => (
  <div className="tooltip-container">
    {children}
    <span className="tooltip-content">{content}</span>
  </div>
);

const ActionButtons = ({ onCreateNote, onSortChange }) => (
  <div className="flex justify-center items-center gap-4 w-full">
    <CustomTooltip content="Create new note">
      <button 
        type="button"
        className="new-note-btn"
        onClick={onCreateNote}
      >
        <SquarePen />
      </button>
    </CustomTooltip>

    <CustomTooltip content="Create new folder">
      <button 
        type="button"
        className="new-note-btn"
        onClick={() => {}}
      >
        <FolderPlus />
      </button>
    </CustomTooltip>

    <CustomTooltip content="Change sort order">
      <SortingButton onSortChange={onSortChange} />
    </CustomTooltip>
  </div>
);

const Sidebar = React.forwardRef(({
  selectedId,
  onNoteSelect,
  notes,
  setNotes,
  onTogglePin,
  onDeleteNote,
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
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sortMethod, setSortMethod] = useState(noteSortingService.getSortMethod());

  const MIN_WIDTH = 280;
  const MAX_WIDTH_PERCENTAGE = 75;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files)
      .filter(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        return ['json', 'md', 'txt'].includes(ext);
      });

    if (files.length > 0) {
      try {
        await noteImportExportService.importNotes(files, {
          openLastImported: true,
          setSelectedId: onNoteSelect,
          setNotes,
          onError: (error, filename) => {
            console.error(`Error importing ${filename}:`, error);
          }
        });
      } catch (error) {
        console.error('Import failed:', error);
      }
    }
  };

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
          
          // Apply MIN_WIDTH constraint
          const effectiveWidth = Math.max(MIN_WIDTH, newWidth);
          
          // Remove collapse classes
          sidebar.classList.remove('hidden');
          mainContent.classList.remove('full-width');
          topBar.classList.remove('full-width');
          header.classList.remove('full-width');
          
          // Update all elements with the constrained width
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
      caretPosition: 0,
      visibleTitle: '',
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
    return noteSortingService.sortNotes(notesToSort);
  }, []);

  useEffect(() => {
    console.log("useEffect in sidebar for subscribing to sorts")
    const unsubscribe = noteUpdateService.subscribe((updatedNote) => {
      setNotes(prevNotes => {
        const updatedNotes = prevNotes.map(note =>
          note.id === updatedNote.id ? updatedNote : note
        );
        return noteSortingService.sortNotes(updatedNotes);
      });
    });
  
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    console.log("useEffect in sidebar for getting sort method")
    const method = noteSortingService.getSortMethod();
    setNotes(prevNotes => [...noteSortingService.sortNotes(prevNotes, method)]);
  }, [noteSortingService.getSortMethod()]);

  const filteredNotes = useMemo(() => {
    return noteSortingService.sortNotes(
      notes.filter(note => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        if (note.locked) {
          const visibleTitle = note.visibleTitle || noteContentService.getFirstLine(note.content);
          return visibleTitle.toLowerCase().includes(search);
        }
        const title = noteContentService.getFirstLine(note.content);
        note.visibleTitle = title;
        const content = noteContentService.getPreviewContent(note.content);
        return title.toLowerCase().includes(search) || content.toLowerCase().includes(search);
      })
    );
  }, [notes, searchTerm, sortMethod]);

  const handleSortChange = useCallback((value) => {
    setNotes(prevNotes => noteSortingService.sortNotes(notes, value));
  }, [notes]);

  return (
    <div 
      ref={sidebarRef}
      className={`sidebar ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      id="sidebar"
      style={{ 
        width: isCollapsed ? 280 : sidebarWidth,
        minWidth: isCollapsed ? 250 : MIN_WIDTH,
      }}
    >
      <div className="sidebar-header">
        <div className="logo">
          <img src={logo2} alt="peridot logo" width="50" height="50" />
          <h1>peridot.</h1>
        </div>
        <div className="search">
          <div className='sidebar-buttons'>
            <ActionButtons onCreateNote={createNewNote} onSortChange={handleSortChange} />
          </div>
          <input
            type="search"
            id="note-search"
            placeholder="Search..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
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
});

export default React.memo(Sidebar);