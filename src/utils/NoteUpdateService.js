import { storageService } from './StorageService';
import { encryptNote } from './encryption';

class NoteUpdateService {
  constructor() {
    this.updateTimers = new Map();
    this.pendingUpdates = new Map();
    this.subscribers = new Set();
    this.isProcessingUnload = false;

    // Bind the unload handler to ensure correct context
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(updatedNote) {
    this.subscribers.forEach(callback => callback(updatedNote));
    
    window.dispatchEvent(new CustomEvent('noteUpdate', {
      detail: { note: updatedNote }
    }));
  }

  async handleBeforeUnload(event) {
    if (this.pendingUpdates.size === 0) return;

    this.isProcessingUnload = true;

    try {
      // Process all pending updates synchronously
      for (const [noteId, updates] of this.pendingUpdates.entries()) {
        await this.processImmediateUpdate(noteId, updates);
      }
    } catch (error) {
      console.error('Error processing updates on unload:', error);
    } finally {
      this.isProcessingUnload = false;
      this.pendingUpdates.clear();
      this.updateTimers.clear();
    }
  }

  async processImmediateUpdate(noteId, updates, updateModified = true, encryptionContext = null) {
    try {
      // Get current note state
      const currentNote = await storageService.readNote(noteId);
      if (!currentNote) return;

      let updatedNote = {
        ...currentNote,
        ...updates,
        dateModified: updateModified ? new Date().toISOString() : currentNote.dateModified
      };

      // Handle encryption if needed
      if (encryptionContext?.shouldEncrypt) {
        if (typeof updatedNote.content === 'string') {
          updatedNote = await encryptNote(updatedNote, encryptionContext.password);
        }
      }

      // Clean up encryption fields if needed
      if (!updatedNote.locked && !updates.locked) {
        delete updatedNote.encrypted;
        delete updatedNote.keyParams;
        delete updatedNote.iv;
        delete updatedNote.visibleTitle;
      }

      // Save to storage
      await storageService.writeNote(noteId, updatedNote);

      // Notify subscribers
      this.notifySubscribers(updatedNote);

    } catch (error) {
      console.error('Failed to process immediate note update:', error);
    }
  }

  async queueUpdate(noteId, updates, updateModified = true, encryptionContext = null) {
    // If unload is in progress, process immediately
    if (this.isProcessingUnload) {
      return this.processImmediateUpdate(noteId, updates, updateModified, encryptionContext);
    }

    // Merge with any existing pending updates for this note
    const existingUpdates = this.pendingUpdates.get(noteId) || {};
    const mergedUpdates = { ...existingUpdates, ...updates };
    this.pendingUpdates.set(noteId, mergedUpdates);

    // Cancel any existing timer for this note
    if (this.updateTimers.has(noteId)) {
      clearTimeout(this.updateTimers.get(noteId));
    }

    // Set a new timer
    const timer = setTimeout(async () => {
      try {
        // Get current note state
        const currentNote = await storageService.readNote(noteId);
        if (!currentNote) return;

        // Get the final merged updates
        const finalUpdates = this.pendingUpdates.get(noteId) || {};
        this.pendingUpdates.delete(noteId);

        let updatedNote = {
          ...currentNote,
          ...finalUpdates,
          dateModified: updateModified ? new Date().toISOString() : currentNote.dateModified
        };

        // Handle encryption if needed
        if (encryptionContext?.shouldEncrypt) {
          if (typeof updatedNote.content === 'string') {
            updatedNote = await encryptNote(updatedNote, encryptionContext.password);
          }
        }

        // Clean up encryption fields if needed
        if (!updatedNote.locked && !finalUpdates.locked) {
          delete updatedNote.encrypted;
          delete updatedNote.keyParams;
          delete updatedNote.iv;
          delete updatedNote.visibleTitle;
        }

        // Save to storage
        await storageService.writeNote(noteId, updatedNote);

        // Notify subscribers
        this.notifySubscribers(updatedNote);

        // Remove the timer
        this.updateTimers.delete(noteId);

      } catch (error) {
        console.error('Failed to process note update:', error);
        this.updateTimers.delete(noteId);
        this.pendingUpdates.delete(noteId);
      }
    }, 200);

    // Store the timer
    this.updateTimers.set(noteId, timer);
  }

  clearUpdatesForNote(noteId) {
    if (this.updateTimers.has(noteId)) {
      clearTimeout(this.updateTimers.get(noteId));
      this.updateTimers.delete(noteId);
    }
    this.pendingUpdates.delete(noteId);
  }

  // Cleanup method to remove event listener when service is no longer needed
  cleanup() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }
}

export const noteUpdateService = new NoteUpdateService();