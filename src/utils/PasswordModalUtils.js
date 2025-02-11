import { encryptNote, decryptNote } from './encryption';
import { noteContentService } from './NoteContentService';
import { passwordStorage } from './PasswordStorageService';
import { storageService } from './StorageService';
import { noteImportExportService } from './NoteImportExportService';
import { FolderService } from './folderUtils';

class PasswordModalUtils {
  constructor() {
    this.subscribers = new Set();
    this.modalType = null;
    this.noteId = null;
    this.noteData = null;
    this.callbacks = null;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  notifySubscribers() {
    this.subscribers.forEach(callback => callback({
      modalType: this.modalType,
      noteId: this.noteId
    }));
  }

  openLockModal(noteId, note) {
    this.modalType = 'lock';
    this.noteId = noteId;
    this.noteData = note;
    this.notifySubscribers();
  }

  openUnlockModal(noteId, note) {
    this.modalType = 'unlock';
    this.noteId = noteId;
    this.noteData = note;
    this.notifySubscribers();
  }

  openLockFolderModal(folderId, folder) {
    this.modalType = 'lockFolder';
    this.noteId = folderId;
    this.noteData = folder;
    this.notifySubscribers();
  }

  openUnlockFolderModal(folderId, folder) {
    this.modalType = 'unlockFolder';
    this.noteId = folderId;
    this.noteData = folder;
    this.notifySubscribers();
  }

  openUnlockFolderPermanentModal(folderId, folder) {
    this.modalType = 'unlockFolderPermanent';
    this.noteId = folderId;
    this.noteData = folder;
    this.notifySubscribers();
  }

  openDownloadUnlockModal(noteId, note, callbacks = null) {
    this.modalType = 'download';
    this.noteId = noteId;
    this.noteData = note;
    this.callbacks = callbacks;
    this.notifySubscribers();
  }

  openDownloadLockModal(folderId, folder) {
    this.modalType = 'download-folder';
    this.noteId = folderId;
    this.noteData = folder;
    this.notifySubscribers();
  }

  closeModal() {
    this.modalType = null;
    this.noteId = null;
    this.noteData = null;
    this.notifySubscribers();
  }

  async handlePasswordSubmit(password, confirmPassword = null) {
    if (!password) return { success: false, error: 'Please enter a password' };
    if (confirmPassword !== null) {
      if (!confirmPassword) return { success: false, error: 'Please fill in both password fields' };
      if (password !== confirmPassword) return { success: false, error: 'Passwords do not match' };
    }
  
    try {
      switch (this.modalType) {
        case 'lock': {
          // First encrypt the note
          const encryptedNote = await encryptNote(this.noteData, password);
          if (!encryptedNote) {
            throw new Error('Encryption failed');
          }
  
          // Store password before modifying note
          await passwordStorage.storePassword(this.noteData.id, password);
          
          const finalNote = {
            ...encryptedNote,
            id: this.noteData.id,
            locked: true,
            encrypted: true,
            // Preserve visible title for locked state
            visibleTitle: this.noteData.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'Untitled'
          };
          
          await storageService.writeNote(this.noteData.id, finalNote);
          window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: finalNote }}));
          break;
        }
  
        case 'unlock': {
          const decryptResult = await decryptNote(this.noteData, password);
          if (!decryptResult.success) {
            return { success: false, error: 'Invalid password' };
          }
  
          // Remove stored password only after successful decryption
          try {
            await passwordStorage.removePassword(this.noteData.id);
          } catch (e) {
            console.warn('Password removal failed, proceeding with unlock:', e);
          }
          
          const unlockedNote = {
            ...decryptResult.note,
            id: this.noteData.id,
            locked: false,
            encrypted: false,
            visibleTitle: undefined
          };
          
          await storageService.writeNote(this.noteData.id, unlockedNote);
          window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: unlockedNote }}));
          break;
        }
  
        case 'download': {
          const fileType = localStorage.getItem('preferredFileType') || 'json';
          await noteImportExportService.downloadNote({
            note: this.noteData,
            fileType,
            isEncrypted: true,
            password,
            onPdfExport: (decryptedNote) => {
              if (this.callbacks?.setPdfExportNote) {
                this.callbacks.setPdfExportNote(decryptedNote);
                this.callbacks.setIsPdfExportModalOpen(true);
              }
            }
          });
          break;
        }

        case 'lockFolder': {
          const lockedFolder = await FolderService.lockFolder(this.noteData, password);
          window.dispatchEvent(new CustomEvent('noteUpdate', { 
            detail: { note: lockedFolder }
          }));
          break;
        }

        case 'unlockFolder': {
          const result = await FolderService.unlockFolder(this.noteData, password);
          if (!result.success) {
            return { success: false, error: result.error };
          }
  
          window.dispatchEvent(new CustomEvent('folderUnlocked', { 
            detail: { folderId: this.noteData.id }
          }));
          break;
        }

        case 'unlockFolderPermanent': {
          const result = await FolderService.unlockFolder(this.noteData, password);
          if (!result.success) {
            return { success: false, error: result.error };
          }
    
          // Permanently unlock the folder
          const unlockedFolder = {
            ...this.noteData,
            locked: false,
            isOpen: true
          };
    
          await storageService.writeNote(this.noteData.id, unlockedFolder);
          await passwordStorage.removePassword(this.noteData.id);
          
          window.dispatchEvent(new CustomEvent('noteUpdate', { 
            detail: { note: unlockedFolder }
          }));
          break;
        }

        case 'download-folder': {
          // Verify the password
          const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true';
          if (!verifyBypass) {
            const storedPassword = await passwordStorage.getPassword(this.noteId);
            if (!storedPassword || password !== storedPassword) {
              return { success: false, error: 'Invalid password' };
            }
          }
  
          // Get all notes for the folder download
          const notes = await storageService.getAllNotes();
          
          // Get preferred file type
          const fileType = localStorage.getItem('preferredFileType') || 'json';
          
          // Import and use FolderService
          const { FolderService } = await import('./folderUtils');
          await FolderService.downloadFolder(this.noteData, notes, fileType);
          break;
        }
      }
  
      this.closeModal();
      return { success: true };
    } catch (error) {
      console.error('Operation failed:', error);
      return { success: false, error: error.message || 'Operation failed' };
    }
  }
}

export const passwordModalUtils = new PasswordModalUtils();