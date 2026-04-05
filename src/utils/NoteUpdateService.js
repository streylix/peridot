import { apiService } from './ApiService.js';

class NoteUpdateService {
  constructor() {
    this.updateTimers = new Map();
    this.pendingUpdates = new Map();
    this.subscribers = new Set();
    this.isProcessingUnload = false;

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

  async handleBeforeUnload() {
    if (this.pendingUpdates.size === 0) return;
    this.isProcessingUnload = true;
    try {
      for (const [noteId, updates] of this.pendingUpdates.entries()) {
        await this.processImmediateUpdate(noteId, updates);
      }
    } finally {
      this.isProcessingUnload = false;
      this.pendingUpdates.clear();
      this.updateTimers.clear();
    }
  }

  async processImmediateUpdate(noteId, updates, updateModified = true) {
    try {
      const currentNote = await apiService.readNote(noteId);
      if (!currentNote) return;

      const updatedNote = {
        ...currentNote,
        ...updates,
        dateModified: updateModified ? new Date().toISOString() : currentNote.dateModified,
      };

      // apiService.writeNote automatically sends the session password for
      // locked notes so the backend can re-encrypt. No client-side crypto needed.
      const saved = await apiService.writeNote(noteId, updatedNote);
      this.notifySubscribers(saved);
    } catch (error) {
      console.error('Failed to process immediate note update:', error);
    }
  }

  async queueUpdate(noteId, updates, updateModified = true) {
    if (this.isProcessingUnload) {
      return this.processImmediateUpdate(noteId, updates, updateModified);
    }

    const existingUpdates = this.pendingUpdates.get(noteId) || {};
    this.pendingUpdates.set(noteId, { ...existingUpdates, ...updates });

    if (this.updateTimers.has(noteId)) {
      clearTimeout(this.updateTimers.get(noteId));
    }

    const timer = setTimeout(async () => {
      try {
        const currentNote = await apiService.readNote(noteId);
        if (!currentNote) return;

        const finalUpdates = this.pendingUpdates.get(noteId) || {};
        this.pendingUpdates.delete(noteId);

        const updatedNote = {
          ...currentNote,
          ...finalUpdates,
          dateModified: updateModified ? new Date().toISOString() : currentNote.dateModified,
        };

        const saved = await apiService.writeNote(noteId, updatedNote);
        this.notifySubscribers(saved);
        this.updateTimers.delete(noteId);
      } catch (error) {
        console.error('Failed to process note update:', error);
        this.updateTimers.delete(noteId);
        this.pendingUpdates.delete(noteId);
      }
    }, 200);

    this.updateTimers.set(noteId, timer);
  }

  clearUpdatesForNote(noteId) {
    if (this.updateTimers.has(noteId)) {
      clearTimeout(this.updateTimers.get(noteId));
      this.updateTimers.delete(noteId);
    }
    this.pendingUpdates.delete(noteId);
  }

  cleanup() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }
}

export const noteUpdateService = new NoteUpdateService();
