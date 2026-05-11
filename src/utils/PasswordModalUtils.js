import { apiService } from './ApiService.js';
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
      noteId: this.noteId,
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

  openDownloadFolderModal(folderId, folder, callbacks = null) {
    this.modalType = 'download-folder';
    this.noteId = folderId;
    this.noteData = folder;
    this.callbacks = callbacks;
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
          const lockedNote = await apiService.lockNote(this.noteId, password, confirmPassword);
          window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: lockedNote } }));
          break;
        }

        case 'unlock': {
          // Unlock from the right-click / info menu is a permanent unlock — the
          // user explicitly chose "Unlock" rather than tapping a locked-note
          // password prompt for a one-off view. The locked-note view's inline
          // prompt still uses session-only unlock via MainContent's handleUnlock.
          const unlockedNote = await apiService.unlockNotePermanent(this.noteId, password);
          window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: unlockedNote } }));
          break;
        }

        case 'download': {
          // Unlock for download only — decrypt on the fly and export
          const result = await apiService.unlockNote(this.noteId, password);
          if (!result.success) return { success: false, error: 'Invalid password' };
          const decryptedNote = result.note;
          const fileType = localStorage.getItem('preferredFileType') || 'json';
          await noteImportExportService.downloadNote({
            note: decryptedNote,
            fileType,
            isEncrypted: false,
            onPdfExport: (note) => {
              if (this.callbacks?.setPdfExportNote) {
                this.callbacks.setPdfExportNote(note);
                this.callbacks.setIsPdfExportModalOpen(true);
              }
            },
          });
          break;
        }

        case 'lockFolder': {
          const lockedFolder = await apiService.lockNote(this.noteId, password);
          window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: lockedFolder } }));
          break;
        }

        case 'unlockFolder': {
          const result = await apiService.unlockNote(this.noteId, password);
          if (!result.success) return { success: false, error: result.error || 'Invalid password' };
          if (result.note) {
            window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: result.note } }));
          }
          window.dispatchEvent(new CustomEvent('folderUnlocked', { detail: { folderId: this.noteId } }));
          break;
        }

        case 'unlockFolderPermanent': {
          const unlockedFolder = await apiService.unlockNotePermanent(this.noteId, password);
          window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: unlockedFolder } }));
          break;
        }

        case 'download-folder': {
          const result = await apiService.unlockNote(this.noteId, password);
          if (!result.success) return { success: false, error: result.error || 'Invalid password' };
          const notes = await apiService.getAllNotes();
          const fileType = localStorage.getItem('preferredFileType') || 'json';
          await FolderService.processDownload(this.noteData, notes, fileType);
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
