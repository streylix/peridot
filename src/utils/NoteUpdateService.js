import { apiService } from './ApiService.js';

class NoteUpdateService {
  constructor() {
    this.updateTimers = new Map();
    this.pendingUpdates = new Map();
    this.pendingUpdateModified = new Map();
    this.subscribers = new Set();
    this.isProcessingUnload = false;

    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(updatedNote, updateModified = true) {
    this.subscribers.forEach(callback => callback(updatedNote, { updateModified }));
    window.dispatchEvent(new CustomEvent('noteUpdate', {
      detail: { note: updatedNote, updateModified }
    }));
  }

  async handleBeforeUnload() {
    if (this.pendingUpdates.size === 0) return;
    this.isProcessingUnload = true;
    try {
      for (const [noteId, updates] of this.pendingUpdates.entries()) {
        const updateModified = this.pendingUpdateModified.get(noteId) ?? true;
        await this.processImmediateUpdate(noteId, updates, updateModified);
      }
    } finally {
      this.isProcessingUnload = false;
      this.pendingUpdates.clear();
      this.pendingUpdateModified.clear();
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
      this.notifySubscribers(saved, updateModified);
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
    const existingUpdateModified = this.pendingUpdateModified.get(noteId) || false;
    this.pendingUpdateModified.set(noteId, existingUpdateModified || updateModified);

    if (this.updateTimers.has(noteId)) {
      clearTimeout(this.updateTimers.get(noteId));
    }

    const timer = setTimeout(async () => {
      try {
        const currentNote = await apiService.readNote(noteId);
        if (!currentNote) return;

        const finalUpdates = this.pendingUpdates.get(noteId) || {};
        const finalUpdateModified = this.pendingUpdateModified.get(noteId) ?? true;
        this.pendingUpdates.delete(noteId);
        this.pendingUpdateModified.delete(noteId);

        const updatedNote = {
          ...currentNote,
          ...finalUpdates,
          dateModified: finalUpdateModified ? new Date().toISOString() : currentNote.dateModified,
        };

        const saved = await apiService.writeNote(noteId, updatedNote);
        this.notifySubscribers(saved, finalUpdateModified);
        this.updateTimers.delete(noteId);
      } catch (error) {
        console.error('Failed to process note update:', error);
        this.updateTimers.delete(noteId);
        this.pendingUpdates.delete(noteId);
        this.pendingUpdateModified.delete(noteId);
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
    this.pendingUpdateModified.delete(noteId);
  }

  cleanup() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }
}

export const noteUpdateService = new NoteUpdateService();
