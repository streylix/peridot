import { storageService } from './StorageService';
import { noteContentService } from './NoteContentService';
import { noteImportExportService } from './NoteImportExportService';
import { passwordStorage } from './PasswordStorageService';
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

  static async lockFolder(folder, password) {
    if (!folder || !this.isFolder(folder)) {
      throw new Error('Invalid folder');
    }

    await passwordStorage.storePassword(folder.id, password);

    return {
      ...folder,
      locked: true,
      isOpen: false
    };
  }

  static async unlockFolder(folder, password) {
    if (!folder || !this.isFolder(folder)) {
      throw new Error('Invalid folder');
    }

    const storedPassword = await passwordStorage.getPassword(folder.id);
    const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true';

    if (!verifyBypass && (!storedPassword || password !== storedPassword)) {
      return { success: false, error: 'Invalid password' };
    }

    return {
      success: true,
      folder: {
        ...folder,
        locked: false,
        isOpen: true
      }
    };
  }

  static async downloadFolder(folder, notes, fileType = 'json') {
    // Handle locked folders
    if (folder.locked) {
      // Get the stored password
      const storedPassword = await passwordStorage.getPassword(folder.id);
      if (!storedPassword) {
        console.error('No stored password found for locked folder');
        return;
      }

      const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true';
      if (!verifyBypass) {
        // Verify the password matches before proceeding
        const { passwordModalUtils } = await import('./PasswordModalUtils');
        passwordModalUtils.openDownloadFolderModal(folder.id, folder, {
          onSuccess: async (password) => {
            if (password === storedPassword) {
              await this.processDownload(folder, notes, fileType);
            } else {
              console.error('Invalid password for folder download');
            }
          }
        });
        return;
      }
    }

    // If folder is not locked or verification is bypassed, proceed with download
    await this.processDownload(folder, notes, fileType);
  }

  static async processDownload(folder, notes, fileType) {
    const getFolderContents = (folderId) => {
      const contents = notes.filter(item => item.parentFolderId === folderId);
      return contents.map(item => {
        if (this.isFolder(item)) {
          return {
            ...item,
            items: getFolderContents(item.id)
          };
        }
        return item;
      });
    };

    // For JSON or PDF, create a flat structure
    if (fileType === 'json' || fileType === 'pdf') {
      try {
        const folderContents = getFolderContents(folder.id);
        const allItems = [folder];
        
        const flattenContents = (items) => {
          items.forEach(item => {
            if (this.isFolder(item)) {
              const { items: subItems, ...folderWithoutItems } = item;
              allItems.push(folderWithoutItems);
              if (subItems) {
                flattenContents(subItems);
              }
            } else {
              allItems.push(item);
            }
          });
        };

        flattenContents(folderContents);

        await noteImportExportService.downloadNote({
          note: allItems,
          fileType: 'json',
          isBackup: false
        });
        return;
      } catch (error) {
        console.error('Failed to download folder as JSON:', error);
        throw error;
      }
    }

    // For other formats, create a ZIP with folder structure
    const zip = new JSZip();
    const rootFolderName = folder.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'folder';
    const rootFolder = zip.folder(rootFolderName);

    const addToZip = async (items, parentFolder) => {
      for (const item of items) {
        if (this.isFolder(item)) {
          const folderName = item.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'Untitled Folder';
          const newFolder = parentFolder.folder(folderName);
          const folderContents = notes.filter(n => n.parentFolderId === item.id);
          await addToZip(folderContents, newFolder);
        } else {
          if (item.locked && item.encrypted) {
            const jsonContent = JSON.stringify(item, null, 2);
            const title = item.visibleTitle;
            parentFolder.file(`${title}.json`, jsonContent);
          } else {
            const noteContent = noteImportExportService.formatNoteContent(item, fileType);
            const title = noteContentService.getFirstLine(item.content)
              .replace(/[^a-z0-9]/gi, '_')
              .toLowerCase();
            parentFolder.file(`${title}.${fileType}`, noteContent);
          }
        }
      }
    };

    const rootContents = notes.filter(n => n.parentFolderId === folder.id);
    await addToZip(rootContents, rootFolder);

    try {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFileName = `${rootFolderName}.zip`;
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to create ZIP:', error);
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
    if (item.locked && !FolderService.isFolder(item)) {
      throw new Error('Item is locked');
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = item.content;
    const firstDiv = contentDiv.querySelector('div');
    
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
      dateModified: new Date().toISOString(),
      visibleTitle: newName
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

  static async deleteFolder(folder, notes) {
    // Find all items (notes and subfolders) that belong to this folder
    const childItems = notes.filter(item => item.parentFolderId === folder.id);
  
    // Recursively delete child items
    for (const item of childItems) {
      if (this.isFolder(item)) {
        await this.deleteFolder(item, notes);
      } else {
        await storageService.deleteNote(item.id);
      }
    }
  
    // Delete the folder itself
    await storageService.deleteNote(folder.id);
  }
}