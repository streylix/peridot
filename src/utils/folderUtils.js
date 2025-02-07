import { storageService } from './StorageService';
import { noteImportExportService } from './NoteImportExportService';

export class FolderService {
  static createFolder(name = 'Untitled Folder') {
    return {
      id: Date.now(),
      content: `<div>${name}</div>`,
      dateModified: new Date().toISOString(),
      type: 'folder',
      pinned: false,
      locked: false,
      isOpen: false
    };
  }

  static togglePin(folder) {
    return {
      ...folder,
      pinned: !folder.pinned
    };
  }

  static async downloadFolder(folder, notes) {
    // Filter notes that belong to this folder
    const folderNotes = notes.filter(note => 
      note.parentFolderId === folder.id
    );

    // Prepare folder object for download
    const folderToDownload = {
      ...folder,
      items: folderNotes
    };

    try {
      await noteImportExportService.downloadNote({
        note: folderToDownload,
        fileType: 'json',
        isBackup: true
      });
    } catch (error) {
      console.error('Failed to download folder:', error);
      throw error;
    }
  }

  static async renameItem(item, newName) {
    if (item.locked) {
      throw new Error('Item is locked');
    }
    console.log(item)
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = item.content;
    const firstDiv = contentDiv.querySelector('div');

    console.log(firstDiv);
    
    if (firstDiv) {
      firstDiv.textContent = newName;
      const updatedContent = contentDiv.innerHTML;
      const updatedItem = {
        ...item,
        content: updatedContent,
        dateModified: new Date().toISOString()
      };
      
      await storageService.writeNote(item.id, updatedItem);
      return updatedItem;
    }
    const updatedItem = {
      ...item,
      content: newName,
      dateModified: new Date().toISOString()
    }
    return updatedItem;
  }

  static isFolder(item) {
    return item?.type === 'folder';
  }

  static toggleFolder(folder) {
    return {
      ...folder,
      isOpen: !folder.isOpen
    };
  }

  static addToFolder(folder, item) {
    if (!folder.items.some(i => i.id === item.id)) {
      return {
        ...folder,
        items: [...folder.items, item],
        dateModified: new Date().toISOString()
      };
    }
    return folder;
  }

  static removeFromFolder(folder, itemId) {
    return {
      ...folder,
      items: folder.items.filter(item => item.id !== itemId),
      dateModified: new Date().toISOString()
    };
  }

  static async deleteFolder(folder) {
    // Recursively delete all items in folder
    for (const item of folder.items) {
      if (this.isFolder(item)) {
        await this.deleteFolder(item);
      } else {
        await storageService.deleteNote(item.id);
      }
    }
    await storageService.deleteNote(folder.id);
  }
}