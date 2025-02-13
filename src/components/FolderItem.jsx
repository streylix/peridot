import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { ChevronRight, Folder, Pin, Lock } from 'lucide-react';
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
    
    onSelect(folder.id);
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
    if (folder?.content?.match) {
      const extractedTitle = folder.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1];
      folder.content = folder.visibleTitle;
      return extractedTitle || folder.visibleTitle;
    }
    return folder.visibleTitle || 'Untitled Folder';
  }, [folder?.content, folder?.visibleTitle]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    onContextMenu(e, folder.id);
  }, [folder.id, onContextMenu]);

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);
    const draggedItem = notes.find(n => n.id === id);
    if (!draggedItem || draggedItem.id === folder.id) return;
    
    // If dragging a folder, maintain its type
    draggedItem.parentFolderId = folder.id;
    draggedItem.dateModified = new Date().toISOString();

    setNotes(prevNotes => prevNotes.map(note => 
      note.id === id ? draggedItem : note
    ));

    try {
      await storageService.writeNote(id, draggedItem);
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  };


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
            {title}
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