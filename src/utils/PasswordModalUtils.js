import { encryptNote, decryptNote } from './encryption';
import { noteContentService } from './NoteContentService';
import { passwordStorage } from './PasswordStorageService';
import { storageService } from './StorageService';
import { noteImportExportService } from './NoteImportExportService';

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

  openDownloadUnlockModal(noteId, note, callbacks = null) {
    this.modalType = 'download';
    this.noteId = noteId;
    this.noteData = note;
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
    if (!password) {
      return { success: false, error: 'Please enter a password' };
    }

    if (confirmPassword !== null) {
      if (!confirmPassword) {
        return { success: false, error: 'Please fill in both password fields' };
      }
      if (password !== confirmPassword) {
        return { success: false, error: 'Passwords do not match' };
      }
    }
    try {
      switch (this.modalType) {
        case 'lock':
          const encryptedNote = await encryptNote(this.noteData, password);
          await passwordStorage.storePassword(this.noteData.id, password);


          await storageService.writeNote(this.noteData.id, {
            ...encryptedNote,
            id: this.noteData.id,
            locked: true,
            encrypted: true
          });

          window.dispatchEvent(new CustomEvent('noteUpdate', {
            detail: { 
              note: {
                ...encryptedNote,
                id: this.noteData.id,
                locked: true,
                encrypted: true
              }
            }
          }));
          break;

        case 'unlock':
          const decryptResult = await decryptNote(this.noteData, password, true);
          if (!decryptResult.success) {
            return { success: false, error: 'Invalid password' };
          }
  
          window.dispatchEvent(new CustomEvent('noteUpdate', {
            detail: { 
              note: {
                ...decryptResult.note,
                id: this.noteData.id,
                locked: false,
                encrypted: false
              }
            }
          }));
          break;

          case 'download':
            const fileType = localStorage.getItem('preferredFileType') || 'json';
            
            try {
              console.log("Downloading from handlePasswordSubmit in PasswordModalUtils.js")
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
              this.closeModal();
              return { success: true };
            } catch (error) {
              return { success: false, error: error.message };
            }
      }

      this.closeModal();
      return { success: true };
    } catch (error) {
      console.error('Operation failed:', error);
      return { success: false, error: 'Operation failed' };
    }
  }
}

export const passwordModalUtils = new PasswordModalUtils();