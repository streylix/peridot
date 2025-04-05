import { storageService } from './StorageService';
import { encryptNote } from './encryption';

class NoteUpdateService {
  constructor() {
    this.subscribers = new Set();
    this.pendingUpdates = new Map();
    this.updateTimers = new Map();
    this.isProcessingUnload = false;
    
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
    
    // Set up BroadcastChannel for real-time cross-tab communication
    this.setupBroadcastChannel();
  }
  
  // Set up cross-tab communication
  setupBroadcastChannel() {
    try {
      this.broadcastChannel = new BroadcastChannel('peridot-note-updates');
      
      this.broadcastChannel.onmessage = (event) => {
        const { type, data } = event.data;
        
        if (type === 'NOTE_UPDATED' && data.note) {
          // Notify subscribers about the update from another tab
          this.notifySubscribers(data.note);
        }
      };
    } catch (error) {
      console.error('BroadcastChannel not supported or failed to initialize:', error);
      // Fall back to localStorage events for cross-tab communication
      this.setupLocalStorageListener();
    }
  }
  
  // Set up localStorage listener for cross-tab communication
  setupLocalStorageListener() {
    window.addEventListener('storage', (event) => {
      if (event.key === 'note_cross_update') {
        try {
          const data = JSON.parse(event.newValue);
          if (data && data.note) {
            this.notifySubscribers(data.note);
          }
        } catch (error) {
          console.error('Failed to parse cross-tab note update:', error);
        }
      }
    });
  }
  
  // Broadcast note update to other tabs
  broadcastUpdate(note) {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'NOTE_UPDATED',
          data: { note }
        });
      } else {
        // Fallback to localStorage
        localStorage.setItem('note_cross_update', JSON.stringify({ 
          note,
          timestamp: Date.now()
        }));
        // Clear it immediately to allow future updates to trigger events
        setTimeout(() => localStorage.removeItem('note_cross_update'), 100);
      }
    } catch (error) {
      console.error('Failed to broadcast note update:', error);
    }
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
      
      // Broadcast the update to other tabs
      this.broadcastUpdate(updatedNote);

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
        
        // Broadcast the update to other tabs
        this.broadcastUpdate(updatedNote);

        // Remove the timer
        this.updateTimers.delete(noteId);

      } catch (error) {
        console.error('Failed to process queued note update:', error);
        this.updateTimers.delete(noteId);
      }
    }, 500);

    this.updateTimers.set(noteId, timer);
  }

  notifySubscribers(note) {
    this.subscribers.forEach(callback => callback(note));

    // Also fire a DOM event for components that listen to it
    const event = new CustomEvent('noteUpdate', {
      detail: { note }
    });
    window.dispatchEvent(event);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }
  
  // Clean up resources when the service is no longer needed
  cleanup() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
    
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    
    // Clear any pending timers
    this.updateTimers.forEach(timer => clearTimeout(timer));
    this.updateTimers.clear();
    this.pendingUpdates.clear();
  }
}

export const noteUpdateService = new NoteUpdateService();