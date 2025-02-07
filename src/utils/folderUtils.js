import { storageService } from './StorageService';
import { noteContentService } from './NoteContentService';
import { noteImportExportService } from './NoteImportExportService';
import JSZip from 'jszip';

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


  static async downloadFolder(folder, notes, fileType = 'json') {
    // Filter notes that belong to this folder
    const folderNotes = notes.filter(note => 
      note.parentFolderId === folder.id
    );

    // For JSON, include folder and its contents
    if (fileType === 'json') {
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
        return;
      } catch (error) {
        console.error('Failed to download folder as JSON:', error);
        throw error;
      }
    }

    // For other file types, create a ZIP
    const zip = new JSZip();
    const folderName = this.extractFolderName(folder);

    // Add each note to the ZIP
    for (const note of folderNotes) {
      try {
        // Create a unique filename for each note
        const noteTitle = noteContentService.getFirstLine(note.content)
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase();
        const fileName = `${noteTitle}.${fileType}`;

        // Convert note to desired file type
        const noteContent = await noteImportExportService.formatNoteContent(note, fileType);
        
        // Add to ZIP
        zip.file(fileName, noteContent);
      } catch (error) {
        console.error(`Failed to process note for zip: ${note.id}`, error);
      }
    }

    // Generate and download ZIP
    try {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFileName = `${folderName}_notes.zip`;
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to create ZIP file:', error);
      throw error;
    }
  }

  static extractFolderName(folder) {
    const matches = folder.content.match(/<div[^>]*>(.*?)<\/div>/);
    return matches 
      ? matches[1].replace(/[^a-z0-9]/gi, '_').toLowerCase() 
      : 'untitled_folder';
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