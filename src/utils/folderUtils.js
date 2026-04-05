import { apiService } from './ApiService.js';
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
      isOpen: false,
    };
  }

  static togglePin(folder) {
    return { ...folder, pinned: !folder.pinned };
  }

  /**
   * Lock a folder — backend stores encrypted verification blob.
   */
  static async lockFolder(folder, password) {
    if (!folder || !this.isFolder(folder)) throw new Error('Invalid folder');
    return apiService.lockNote(folder.id, password);
  }

  /**
   * Unlock a folder — backend verifies password against stored blob.
   * Returns { success, folder } where folder.isOpen = true if correct.
   */
  static async unlockFolder(folder, password) {
    if (!folder || !this.isFolder(folder)) throw new Error('Invalid folder');
    try {
      const result = await apiService.unlockNote(folder.id, password);
      return result; // { success, note }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  static async downloadFolder(folder, notes, fileType = 'json') {
    if (folder.locked) {
      const { passwordModalUtils } = await import('./PasswordModalUtils');
      passwordModalUtils.openDownloadFolderModal(folder.id, folder, {});
      return;
    }
    await this.processDownload(folder, notes, fileType);
  }

  static async processDownload(folder, notes, fileType) {
    const getFolderContents = (folderId) => {
      return notes
        .filter(item => item.parentFolderId === folderId)
        .map(item => this.isFolder(item)
          ? { ...item, items: getFolderContents(item.id) }
          : item
        );
    };

    if (fileType === 'json' || fileType === 'pdf') {
      const folderContents = getFolderContents(folder.id);
      const allItems = [folder];
      const flatten = (items) => {
        items.forEach(item => {
          if (this.isFolder(item)) {
            const { items: sub, ...rest } = item;
            allItems.push(rest);
            if (sub) flatten(sub);
          } else {
            allItems.push(item);
          }
        });
      };
      flatten(folderContents);
      await noteImportExportService.downloadNote({ note: allItems, fileType: 'json', isBackup: false });
      return;
    }

    const zip = new JSZip();
    const rootFolderName = folder.content?.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'folder';
    const rootFolder = zip.folder(rootFolderName);

    const addToZip = async (items, parent) => {
      for (const item of items) {
        if (this.isFolder(item)) {
          const name = item.content?.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'Untitled Folder';
          const sub = parent.folder(name);
          await addToZip(notes.filter(n => n.parentFolderId === item.id), sub);
        } else if (item.locked && item.encrypted) {
          parent.file(`${item.visibleTitle}.json`, JSON.stringify(item, null, 2));
        } else {
          const noteContent = noteImportExportService.formatNoteContent(item, fileType);
          const title = noteContentService.getFirstLine(item.content).replace(/[^a-z0-9]/gi, '_').toLowerCase();
          parent.file(`${title}.${fileType}`, noteContent);
        }
      }
    };

    await addToZip(notes.filter(n => n.parentFolderId === folder.id), rootFolder);

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rootFolderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static extractFolderName(folder) {
    const matches = folder.content?.match(/<div[^>]*>(.*?)<\/div>/);
    return matches ? matches[1].replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'untitled_folder';
  }

  static async renameItem(item, newName) {
    if (item.locked && !FolderService.isFolder(item)) throw new Error('Item is locked');
    const div = document.createElement('div');
    div.innerHTML = item.content;
    const firstDiv = div.querySelector('div');
    const updatedContent = firstDiv
      ? (firstDiv.textContent = newName, div.innerHTML)
      : newName;
    const updatedItem = { ...item, content: updatedContent, dateModified: new Date().toISOString() };
    await apiService.writeNote(item.id, updatedItem);
    return updatedItem;
  }

  static isFolder(item) {
    return item?.type === 'folder';
  }

  static toggleFolder(folder) {
    return { ...folder, isOpen: !folder.isOpen };
  }

  static async deleteFolder(folder, notes) {
    const childItems = notes.filter(item => item.parentFolderId === folder.id);
    for (const item of childItems) {
      if (this.isFolder(item)) await this.deleteFolder(item, notes);
      else await apiService.deleteNote(item.id);
    }
    await apiService.deleteNote(folder.id);
  }
}
