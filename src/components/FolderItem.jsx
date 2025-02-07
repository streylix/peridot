import React, { useState, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { FolderService } from '../utils/folderUtils';
import { storageService } from '../utils/StorageService';
import NoteItem from './NoteItem';

export const FolderItem = React.memo(({
  folder,
  depth = 0,
  isSelected,
  onSelect,
  onNoteSelect,
  onContextMenu,
  setNotes,
  children
}) => {

  const title = useMemo(() => {
    const extractedTitle = folder.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1];
    return extractedTitle || 'Untitled Folder';
  }, [folder.content]);
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
          onClick={() => onSelect(folder.id)}
        >
          <div
            className="folder-expand-icon"
          >
            {folder.items && folder.items.length > 0 && <ChevronRight />}
          </div>
          <div className="folder-icon">
            <Folder size={20} />
          </div>
          <div className="folder-title">
            {title}
          </div>
        </div>
      </li>
      
      {folder.isOpen && folder.items && folder.items.length > 0 && (
        <>
          {folder.items.map(item =>
            FolderService.isFolder(item) ? (
              <FolderItem
                key={item.id}
                folder={item}
                depth={depth + 1}
                isSelected={isSelected}
                onSelect={onSelect}
                onNoteSelect={onNoteSelect}
                onContextMenu={onContextMenu}
                setNotes={setNotes}
              />
            ) : (
              <NoteItem
                key={item.id}
                note={item}
                depth={depth + 1}
                isSelected={isSelected}
                onNoteSelect={onNoteSelect}
                onContextMenu={onContextMenu}
              />
            )
          )}
        </>
      )}
    </>
  );
});

export default FolderItem;