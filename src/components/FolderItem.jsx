import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { ChevronRight, Folder, Pin, Lock, Edit, Check } from 'lucide-react';
import NoteItem from './NoteItem';
import { storageService } from '../utils/StorageService';
import { FolderService } from '../utils/folderUtils';
import { passwordModalUtils } from '../utils/PasswordModalUtils';


const FolderItem = React.memo(({
  folder,
  depth = 0,
  selectedId,
  isSelected,
  onSelect,
  onNoteSelect,
  onContextMenu,
  setNotes,
  notes,
  folderNotes = []
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(!folder.locked);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [shouldRender, setShouldRender] = useState(folder.isOpen);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (folder.isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
    } else {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 200); // Match this with CSS animation duration
      return () => clearTimeout(timer);
    }
  }, [folder.isOpen]);

  const showExpandIcon = useMemo(() => {
    return folderNotes.length > 0 && (!folder.locked || (folder.locked && isUnlocked && folder.isOpen));
  }, [folderNotes.length, folder.locked, isUnlocked, folder.isOpen]);

  const toggleExpand = useCallback((e) => {
    e.stopPropagation();
    
    if (folder.locked && !isUnlocked) {
      passwordModalUtils.openUnlockFolderModal(folder.id, folder);
      return;
    }

    if (folder.locked && isUnlocked){
      setIsUnlocked(false);
    }
    
    // Call onSelect to toggle folder state in parent component (Sidebar)
    onSelect(folder.id);
    
    // No server synchronization needed for open/close state
  }, [folder, isUnlocked, onSelect]);

  // Subscribe to unlock events
  useEffect(() => {
    const handleUnlock = (event) => {
      if (event.detail.folderId === folder.id) {
        setIsUnlocked(true);
        setNotes(prev => prev.map(note => 
          note.id === folder.id ? { ...note, isOpen: true } : note
        ));
      }
    };

    window.addEventListener('folderUnlocked', handleUnlock);
    return () => window.removeEventListener('folderUnlocked', handleUnlock);
  }, [folder.id, setNotes]);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: folder.id,
      type: 'folder'
    }));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const title = useMemo(() => {
    // First try to use visibleTitle property
    if (folder.visibleTitle) {
      return folder.visibleTitle;
    }
    
    // If no visibleTitle, try to extract from content
    if (folder?.content?.match) {
      const extractedTitle = folder.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1];
      return extractedTitle || 'Untitled Folder';
    }
    
    // Fallback
    return 'Untitled Folder';
  }, [folder?.content, folder?.visibleTitle]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    onContextMenu(e, folder.id);
  }, [folder.id, onContextMenu]);

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    try {
      const data = e.dataTransfer.getData('text/plain');
      const { id } = JSON.parse(data);
      const draggedItem = notes.find(n => n.id === id);
      
      if (!draggedItem) return;
      
      // Don't allow dropping a folder into itself or its descendants
      if (FolderService.isFolder(draggedItem) && 
          (draggedItem.id === folder.id || isDescendantFolder(draggedItem.id, folder.id))) {
        console.log('Cannot move a folder into itself or its descendants');
        return;
      }
      
      // Use the FolderService to add the note to this folder
      const updatedItem = FolderService.addNoteToFolder(draggedItem, folder.id);
      
      // Update local state
      setNotes(prevNotes => prevNotes.map(note => 
        note.id === id ? updatedItem : note
      ));
      
      // Save to storage
      await storageService.writeNote(id, updatedItem);
      
      // If the folder isn't already open, open it to show the added item
      if (!folder.isOpen) {
        handleToggleFolder();
      }
    } catch (error) {
      console.error('Failed to move item to folder:', error);
    }
  };

  // Helper function to check if a folder is a descendant of another folder
  const isDescendantFolder = (folderId, potentialAncestorId) => {
    const folder = notes.find(n => n.id === folderId);
    if (!folder) return false;
    
    if (folder.parentFolderId === potentialAncestorId) return true;
    
    if (folder.parentFolderId) {
      return isDescendantFolder(folder.parentFolderId, potentialAncestorId);
    }
    
    return false;
  };

  const handleEditStart = useCallback((e) => {
    e.stopPropagation();
    setEditTitle(title);
    setIsEditing(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 50);
  }, [title]);

  const handleEditSave = useCallback(async (e) => {
    e.stopPropagation();
    
    if (editTitle.trim() === '') {
      setEditTitle('Untitled Folder');
    }
    
    if (editTitle !== title) {
      // Update both content and visibleTitle consistently
      const updatedFolder = FolderService.updateFolderTitle(folder, editTitle.trim());
      
      // Update local state
      setNotes(prev => prev.map(note => 
        note.id === folder.id ? updatedFolder : note
      ));
      
      // Save to storage
      await storageService.writeNote(folder.id, updatedFolder);
      
      // This will trigger sync if connected to backend
    }
    
    setIsEditing(false);
  }, [editTitle, folder, title, setNotes]);

  const handleTitleChange = useCallback((e) => {
    setEditTitle(e.target.value);
  }, []);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleEditSave(e);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditTitle(title);
    }
  }, [handleEditSave, title]);

  return (
    <>
      <li
        className={`folder-item ${isSelected ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ marginLeft: `${depth * 40}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        onClick={toggleExpand}
      >
        <div 
          className="folder-header"
          data-expanded={folder.isOpen && isUnlocked}
        >
          <div className="folder-expand-icon">
            {folderNotes.length > 0 && <ChevronRight />}
          </div>
          <div className="folder-icon">
            <Folder size={20} />
          </div>
          <div className="folder-title" style={{ flex: 1 }}>
            {isEditing ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editTitle}
                onChange={handleTitleChange}
                onKeyDown={handleKeyPress}
                onBlur={handleEditSave}
                onClick={(e) => e.stopPropagation()}
                className="folder-title-input"
              />
            ) : (
              <>
                <span className="title-text">{title}</span>
                <button 
                  className="edit-title-btn" 
                  onClick={handleEditStart}
                  aria-label="Edit folder name"
                >
                  <Edit size={14} />
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            {folder.pinned && <Pin size={20} className="pin-indicator" />}
            {folder.locked && <Lock size={20} className="lock-indicator" />}
          </div>
        </div>
      </li>
      
      {(!folder.locked || isUnlocked) && shouldRender && folderNotes.length > 0 && (
        <div 
          className={`folder-content ${isAnimatingOut ? 'closing' : 'expanded'}`}
        >
          <div className="folder-line" style={{ left: `${depth * 40 + 21}px` }} />
          {[...folderNotes]
            .sort((a, b) => {
              if (FolderService.isFolder(a) && !FolderService.isFolder(b)) return -1;
              if (!FolderService.isFolder(a) && FolderService.isFolder(b)) return 1;
              return 0;
            })
            .map(item => (
              FolderService.isFolder(item) ? (
                <FolderItem
                  key={item.id}
                  folder={item}
                  selectedId={selectedId}
                  isSelected={item.id === selectedId}
                  onSelect={onSelect}
                  onNoteSelect={onNoteSelect}
                  onContextMenu={onContextMenu}
                  setNotes={setNotes}
                  notes={notes}
                  folderNotes={notes.filter(note => note.parentFolderId === item.id)}
                  depth={depth + 1}
                />
              ) : (
                <NoteItem
                  key={item.id}
                  note={item}
                  depth={depth + 1}
                  isSelected={item.id === selectedId}
                  onNoteSelect={onNoteSelect}
                  onContextMenu={onContextMenu}
                />
              )
            ))}
        </div>
      )}
    </>
  );
});

export default FolderItem;