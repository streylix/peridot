import React, { useState, useCallback, useMemo, useRef, useEffect, useImperativeHandle } from 'react';
import { useMobileSidebar } from './useMobileSidebar';
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
import { FolderService } from '../utils/folderUtils';
import FolderItem from './FolderItem';
import { searchService } from '../utils/SearchService';

const CustomTooltip = ({ children, content }) => (
  <div className="tooltip-container">
    {children}
    <span className="tooltip-content">{content}</span>
  </div>
);

const ActionButtons = ({ onCreateNote, onCreateFolder, onSortChange }) => (
  <div className="sidebar-btn-group">
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
        onClick={onCreateFolder}
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
  setIsPdfExportModalOpen,
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
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
  
    if (hasFiles) {
      const items = Array.from(e.dataTransfer.items);
      const hasValidFile = items.some(item => {
        return item.kind === 'file' && ([
          'application/json',
          'text/markdown',
          'text/x-markdown', 
          'text/plain',
          'application/zip',
          'application/x-zip-compressed'
        ].includes(item.type) || 
        item.type === '' && item.getAsFile().name.toLowerCase().endsWith('.zip'));
      });
  
      if (hasValidFile) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }
    }
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
        return ['json', 'md', 'txt', 'zip'].includes(ext);
      });
  
    if (files.length > 0) {
      try {
        const zipFiles = files.filter(file => file.name.toLowerCase().endsWith('.zip'));
        const otherFiles = files.filter(file => !file.name.toLowerCase().endsWith('.zip'));
  
        if (otherFiles.length > 0) {
          await noteImportExportService.importNotes(otherFiles, {
            openLastImported: true,
            setSelectedId: onNoteSelect,
            setNotes,
            onError: (error, filename) => {
              console.error(`Error importing ${filename}:`, error);
            }
          });
        }
  
        for (const zipFile of zipFiles) {
          const { ZipImportHandler } = await import('../utils/ZipImportHandler');
          await ZipImportHandler.importZip(zipFile, {
            setNotes,
            onNoteSelect
          });
        }
      } catch (error) {
        console.error('Import failed:', error);
      }
    }
  };

  const { isMobile, handleNoteSelect } = useMobileSidebar({
    sidebarRef,
    onToggleSidebar: () => {
      if (ref.current && ref.current.toggleSidebar) {
        ref.current.toggleSidebar();
      }
    }
  });
  
  const wrappedNoteSelect = useCallback((noteId) => {
    // First, select the note
    onNoteSelect(handleNoteSelect(noteId));
  }, [onNoteSelect, handleNoteSelect]);

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

      if (isMobile) {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        const header = document.querySelector('header');
        const topBar = document.querySelector('.top-bar');
        
        if (sidebar && mainContent) {
          // If sidebar is currently hidden, show it
          if (sidebar.classList.contains('hidden')) {
            sidebar.classList.remove('hidden');
            mainContent.classList.remove('full-width');
            
            // Ensure header and top bar are reset
            if (header) header.style.left = '0px';
            if (topBar) topBar.style.width = '100%';
          } 
          // If sidebar is visible, hide it
          else {
            sidebar.classList.add('hidden');
            mainContent.classList.add('full-width');
            mainContent.style.width = '100%';
            // Reset header and top bar to full width
            if (header) header.style.left = '0px';
            if (topBar) topBar.style.width = '100%';
          }
        }
      }
      else if (isCollapsed) {
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

  const handleSidebarDrop = async (e) => {
    e.preventDefault();
    // Only handle drops on the sidebar itself, not its children
    if (e.target !== e.currentTarget) return;
    
    try {
      const data = e.dataTransfer.getData('text/plain');
      const { id } = JSON.parse(data);
      const draggedItem = notes.find(n => n.id === id);
      
      if (!draggedItem) return;
      
      // Only process if the item actually needs to be removed from a folder
      if (draggedItem.parentFolderId) {
        // Use the FolderService to remove the note from its folder
        const updatedItem = FolderService.removeNoteFromFolder(draggedItem);
        
        // Update local state
        setNotes(prevNotes => prevNotes.map(note => 
          note.id === id ? updatedItem : note
        ));
        
        // Save to storage
        await storageService.writeNote(id, updatedItem);
        
        // Log for debugging
        console.log(`Removed note ${id} from folder ${draggedItem.parentFolderId}`);
      }
    } catch (error) {
      console.error('Failed to move item:', error);
    }
  };

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
      content: '<div></div>',
      dateModified: new Date().toISOString(),
      pinned: false,
      caretPosition: 0,
      visibleTitle: '',
    };

    try {
      await storageService.writeNote(newNote.id, newNote);
      setNotes(prevNotes => {
        const updatedNotes = sortNotes([newNote, ...prevNotes]);
        return updatedNotes;
      });
      onNoteSelect(newNote.id);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const createNewFolder = async () => {
    const newFolder = FolderService.createFolder();
  
    try {
      await storageService.writeNote(newFolder.id, newFolder);
      setNotes(prevNotes => sortNotes([newFolder, ...prevNotes]));
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };
  

  const sortNotes = useCallback((notesToSort) => {
    return noteSortingService.sortNotes(notesToSort);
  }, []);

  useEffect(() => {
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
    const method = noteSortingService.getSortMethod();
    setNotes(prevNotes => [...noteSortingService.sortNotes(prevNotes, method)]);
  }, [noteSortingService.getSortMethod()]);

  const filteredNotes = useMemo(() => {
    return searchService.searchNotes(notes, searchTerm);
  }, [notes, searchTerm, sortMethod]);

  const getFolderState = (folderId) => {
    try {
      const folderStates = JSON.parse(localStorage.getItem('folder_states') || '{}');
      return folderStates[folderId] || false;
    } catch (e) {
      return false;
    }
  };

  const saveFolderState = (folderId, isOpen) => {
    try {
      const folderStates = JSON.parse(localStorage.getItem('folder_states') || '{}');
      folderStates[folderId] = isOpen;
      localStorage.setItem('folder_states', JSON.stringify(folderStates));
    } catch (e) {
      console.error('Failed to save folder state:', e);
    }
  };

  const handleItemSelect = useCallback((itemId) => {
    if (!itemId) return;

    // Find the selected item
    const selectedItem = notes.find(note => note.id === itemId);
    if (!selectedItem) return;

    // If it's a note, just set it as the selected note
    if (selectedItem.type !== 'folder') {
      onNoteSelect(itemId);
      return;
    }

    // For folders, toggle the isOpen state without saving to storage
    const isCurrentlyOpen = selectedItem.isOpen || false;
    const newOpenState = !isCurrentlyOpen;
    
    // Update folder state in localStorage
    saveFolderState(itemId, newOpenState);
    
    // Update UI state in React
    let updatedNotes = notes.map(note => 
      note.id === itemId ? { ...note, isOpen: newOpenState } : note
    );
    setNotes(updatedNotes);
  }, [notes, onNoteSelect, setNotes]);

  useEffect(() => {
    if (notes.length > 0) {
      // Initialize isOpen state for all folders from localStorage
      const updatedNotes = notes.map(note => {
        if (note.type === 'folder') {
          return { ...note, isOpen: getFolderState(note.id) };
        }
        return note;
      });
      
      // Only update if there are changes
      if (JSON.stringify(updatedNotes) !== JSON.stringify(notes)) {
        setNotes(updatedNotes);
      }
    }
  }, [notes.length]); // Only run when notes array length changes (initial load)

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
      style={!isMobile ? { 
        width: isCollapsed ? 280 : sidebarWidth,
        minWidth: isCollapsed ? 250 : MIN_WIDTH,
      } : undefined}
    >
      <div className="sidebar-header" 
        style={!isMobile ? { 
          width: isCollapsed ? 280-1 : sidebarWidth-1,
          minWidth: isCollapsed ? 250-1 : MIN_WIDTH-1,
        } : undefined}>
        <div className="logo">
          <img src={logo2} alt="peridot logo" width="50" height="50" />
          <h1>peridot.</h1>
        </div>
        <div className="search">
          <div className='sidebar-buttons'>
            <ActionButtons onCreateNote={createNewNote} onCreateFolder={createNewFolder} onSortChange={handleSortChange} />
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
      <ul 
        className="note-list"
        onDrop={handleSidebarDrop}
        onDragOver={(e) => e.preventDefault()}
      >
      <div className="sidebar-spacer" style={{ height: '142px' }} />
      {filteredNotes.map(item => 
        FolderService.isFolder(item) ? (
          <FolderItem
            key={item.id}
            folder={item}
            isSelected={item.id === selectedId}
            onSelect={handleItemSelect}
            onNoteSelect={wrappedNoteSelect}
            onContextMenu={handleContextMenu}
            notes={notes}
            folderNotes={notes.filter(note => note.parentFolderId === item.id)}
            setNotes={setNotes}
            selectedId={selectedId}
          />
        ) : (
          <NoteItem
            key={item.id}
            note={item}
            isSelected={item.id === selectedId}
            onNoteSelect={wrappedNoteSelect}
            onContextMenu={handleContextMenu}
          />
        )
      )}
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
          setNotes={setNotes}
          onNoteSelect={wrappedNoteSelect}
        />
      )}
    </div>
  );
});

export default React.memo(Sidebar);