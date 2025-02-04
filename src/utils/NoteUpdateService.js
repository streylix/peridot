import { storageService } from './StorageService';
import { encryptNote } from './encryption';

class NoteUpdateService {
  constructor() {
    this.updateQueue = [];
    this.processingRef = false;
    this.subscribers = new Set();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(updatedNote) {
    this.subscribers.forEach(callback => callback(updatedNote));
    
    // Also dispatch a DOM event for compatibility
    window.dispatchEvent(new CustomEvent('noteUpdate', {
      detail: { note: updatedNote }
    }));
  }

  // Queue an update for processing
  async queueUpdate(noteId, updates, updateModified = true, encryptionContext = null) {
    this.updateQueue.push({
      noteId,
      updates,
      updateModified,
      encryptionContext
    });

    // Start processing if not already running
    if (!this.processingRef) {
      this.processUpdates();
    }
  }

  // Process the update queue
  async processUpdates() {
    if (this.processingRef || this.updateQueue.length === 0) return;
    
    this.processingRef = true;
    const update = this.updateQueue[0];

    try {
      // Get current note state
      const currentNote = await storageService.readNote(update.noteId);
      if (!currentNote) throw new Error('Note not found');

      let updatedNote = {
        ...currentNote,
        ...update.updates,
        dateModified: update.updateModified ? new Date().toISOString() : currentNote.dateModified
      };

      // Handle encryption if needed
      if (update.encryptionContext?.shouldEncrypt) {
        try {
          if (typeof updatedNote.content === 'string'){
            updatedNote = await encryptNote(
              updatedNote, 
              update.encryptionContext.password
            );
          }
        } catch (error) {
          // If encryption fails, continue with unencrypted update
          console.warn('Encryption failed, continuing with unencrypted update');
        }
      }

      // Clean up encryption fields if needed
      if (!updatedNote.locked && !update.updates.locked) {
        delete updatedNote.encrypted;
        delete updatedNote.keyParams;
        delete updatedNote.iv;
        delete updatedNote.visibleTitle;
      }

      // Save to storage
      await storageService.writeNote(update.noteId, updatedNote);

      // Notify subscribers
      this.notifySubscribers(updatedNote);

    } catch (error) {
      console.error('Failed to process update:', error);
    } finally {
      // Remove processed update and continue if more updates exist
      this.updateQueue.shift();
      this.processingRef = false;

      if (this.updateQueue.length > 0) {
        setTimeout(() => this.processUpdates(), 0);
      }
    }
  }

  // Helper to clean encrypted fields
  cleanEncryptedFields(note) {
    const cleaned = { ...note };
    delete cleaned.encrypted;
    delete cleaned.keyParams;
    delete cleaned.iv;
    delete cleaned.visibleTitle;
    return cleaned;
  }

  // Clear all pending updates for a note
  clearUpdatesForNote(noteId) {
    this.updateQueue = this.updateQueue.filter(update => update.noteId !== noteId);
  }
}

export const noteUpdateService = new NoteUpdateService();