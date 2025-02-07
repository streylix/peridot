import React, { useCallback, useMemo, useState } from 'react';
import { ChevronRight, Folder, Pin, Lock } from 'lucide-react';
import NoteItem from './NoteItem';
import { storageService } from '../utils/StorageService';

const FolderItem = React.memo(({
  folder,
  depth = 0,
  isSelected,
  onSelect,
  onNoteSelect,
  onContextMenu,
  setNotes,
  selectedId,
  notes,
  folderNotes = []
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

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
    const extractedTitle = folder.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1];
    return extractedTitle || 'Untitled Folder';
  }, [folder.content]);

  const toggleExpand = useCallback((e) => {
    e.stopPropagation();
    onSelect(folder.id);
  }, [onSelect, folder.id]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    onContextMenu(e, folder.id);
  }, [folder.id, onContextMenu]);

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    const { id } = JSON.parse(data);
    const draggedItem = notes.find(n => n.id === id);
    if (!draggedItem) return;
    
    draggedItem.parentFolderId = folder.id;
    draggedItem.dateModified = new Date().toISOString();

    setNotes(prevNotes => prevNotes.map(note => 
      note.id === id ? draggedItem : note
    ));

    try {
      await storageService.writeNote(id, draggedItem);
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };


  return (
    <>
      <li
        className={`folder-item ${isSelected ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ marginLeft: `${depth * 16}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(folder.id);
        }}
      >
        <div 
          className="folder-header"
          data-expanded={folder.isOpen}
          onClick={toggleExpand}
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
      
      {folder.isOpen && folderNotes.length > 0 && (
        folderNotes.map(note => (
          <NoteItem
            key={note.id}
            note={note}
            depth={depth + 1}
            isSelected={note.id === selectedId}
            onNoteSelect={onNoteSelect}
            onContextMenu={onContextMenu}
          />
        ))
      )}
    </>
  );
});

export default FolderItem;