import React, { useCallback, useMemo } from 'react';
import { ChevronRight, Folder, Pin, Lock } from 'lucide-react';
import { FolderService } from '../utils/folderUtils';
import NoteItem from './NoteItem';

export const FolderItem = React.memo(({
  folder,
  depth = 0,
  isSelected,
  onSelect,
  onNoteSelect,
  onContextMenu,
  setNotes,
  notes = []
}) => {
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

  return (
    <>
      <li
        className={`folder-item ${isSelected ? 'active' : ''}`}
        style={{ marginLeft: `${depth * 16}px` }}
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
            {notes.length > 0 && <ChevronRight />}
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
      
      {folder.isOpen && notes.length > 0 && (
        notes.map(note => (
          <NoteItem
            key={note.id}
            note={note}
            depth={depth + 1}
            isSelected={isSelected}
            onNoteSelect={onNoteSelect}
            onContextMenu={onContextMenu}
          />
        ))
      )}
    </>
  );
});

export default FolderItem;