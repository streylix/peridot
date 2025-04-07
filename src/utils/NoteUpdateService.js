import { storageService } from './StorageService';
import { encryptNote } from './encryption';

// API base URL for server endpoints
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://notes.peridot.software/v1' 
  : 'http://localhost:8000/api';

class NoteUpdateService {
  constructor() {
    this.subscribers = new Set();
    this.pendingUpdates = new Map();
    this.updateTimers = new Map();
    this.isProcessingUnload = false;
    this.authToken = localStorage.getItem('authToken');
    
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

      // Save to local storage
      await storageService.writeNote(noteId, updatedNote);

      // Push update to server if authenticated
      if (this.authToken) {
        this.pushNoteToServer(noteId, updatedNote)
          .catch(error => console.error('Failed to push note update to server:', error));
      }

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

        // Save to local storage
        await storageService.writeNote(noteId, updatedNote);

        // Push update to server if authenticated
        if (this.authToken) {
          this.pushNoteToServer(noteId, updatedNote)
            .catch(error => console.error('Failed to push note update to server:', error));
        }

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

  // Push note update to server
  async pushNoteToServer(noteId, noteData) {
    if (!this.authToken) return;
    
    try {
      // Convert to Django format (handle any necessary field conversions)
      const djangoNote = this.convertToDjangoFormat(noteData);
      
      // Try to update the note first
      let response = await fetch(`${API_BASE_URL}/notes/${noteId}/`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(djangoNote)
      });
      
      // If note doesn't exist yet, create it
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/notes/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(djangoNote)
        });
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Update sync status event
      window.dispatchEvent(new CustomEvent('noteSyncUpdate', {
        detail: { 
          noteId,
          status: {
            status: 'synced',
            lastSynced: new Date().toISOString(),
            size: new Blob([JSON.stringify(noteData)]).size
          }
        }
      }));
      
      return true;
    } catch (error) {
      console.error(`Failed to push note ${noteId} to server:`, error);
      
      // Update sync status event with failure
      window.dispatchEvent(new CustomEvent('noteSyncUpdate', {
        detail: { 
          noteId,
          status: {
            status: 'failed',
            lastSynced: null,
            error: error.message
          }
        }
      }));
      
      return false;
    }
  }
  
  // Convert note to Django format for sending to backend
  convertToDjangoFormat(note) {
    // Create a copy to avoid modifying the original
    const djangoNote = { ...note };
    
    // Handle specific field conversions if needed
    
    // Handle caretPosition which isn't in the Django model
    if (djangoNote.caretPosition !== undefined) {
      // Keep it for frontend, Django will ignore it
    }
    
    // Handle dateCreated which isn't used in PUT/POST requests
    if (djangoNote.dateCreated !== undefined) {
      // Keep it for frontend, Django will ignore it
    }
    
    // Ensure type is set for folders
    if (!djangoNote.type && djangoNote.content && 
        typeof djangoNote.content === 'string' && 
        djangoNote.content.startsWith('<div>')) {
      // This might be a folder, check if it has isOpen property
      if (djangoNote.isOpen !== undefined) {
        djangoNote.type = 'folder';
      } else {
        djangoNote.type = 'note';
      }
    }
    
    return djangoNote;
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
  
  // Set authentication token
  setAuthToken(token) {
    this.authToken = token;
    localStorage.setItem('authToken', token);
  }
  
  // Clear authentication token
  clearAuthToken() {
    this.authToken = null;
    localStorage.removeItem('authToken');
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