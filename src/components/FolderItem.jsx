import React, { useState, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { FolderService } from '../utils/folderUtils';
import { storageService } from '../utils/StorageService';

export const FolderItem = React.memo(({
  folder,
  isSelected,
  onSelect,
  onContextMenu,
  setNotes,
  children
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const title = useMemo(() => {
    if (folder.locked && folder.title) {
      return folder.title;
    }
    return folder.title.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'Untitled Folder';
  }, [folder.title]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    onContextMenu(e, folder.id);
  }, [folder.id, onContextMenu]);

  return (
    <div className={`folder-item ${isSelected ? 'active' : ''}`}>
      <div
        className="folder-header"
        onClick={() => onSelect(folder.id)}
        onContextMenu={handleContextMenu}
      >
        <div className="folder-icon">
          {folder.isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <Folder size={20} />
        </div>
        <div className="folder-title">
          {title}
        </div>
      </div>
      {folder.isOpen && children}
    </div>
  );
});

FolderItem.utils = {
  async createFolder() {
    const newFolder = {
        id: Date.now(),
        content: '',
        dateModified: new Date().toISOString(),
        pinned: false,
        caretPosition: 0,
        type: 'folder',
        items: [],
        isOpen: false
    }

    try {
        await storageService.writeNote(newFolder.id, newFolder);
        setNotes(prevNotes => sortNotes([newFolder, ...prevNotes]));
        onNoteSelect(newFolder.id);
      } catch (error) {
        console.error('Failed to create note:', error);
      }
  },

  isFolder(item) {
    return item?.type === 'folder';
  },

  toggleFolder(folder) {
    return {
      ...folder,
      isOpen: !folder.isOpen
    };
  },

  addToFolder(folder, item) {
    if (!folder.items.some(i => i.id === item.id)) {
      return {
        ...folder,
        items: [...folder.items, item],
        dateModified: new Date().toISOString()
      };
    }
    return folder;
  },

  removeFromFolder(folder, itemId) {
    return {
      ...folder,
      items: folder.items.filter(item => item.id !== itemId),
      dateModified: new Date().toISOString()
    };
  },

  async deleteFolder(folder) {
    for (const item of folder.items) {
      if (this.isFolder(item)) {
        await this.deleteFolder(item);
      } else {
        await storageService.deleteNote(item.id);
      }
    }
    await storageService.deleteNote(folder.id);
  }
};

export default FolderItem;