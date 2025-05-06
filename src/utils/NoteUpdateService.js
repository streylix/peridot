import { storageService } from './StorageService';
import { encryptNote } from './encryption';
import { syncService } from './SyncService';

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
    this.lastUpdateTime = new Map();
    this.UPDATE_RATE_LIMIT = 2000; // 2 seconds rate limit
    
    // Initialize additional tracking for sync operations
    this.isSyncing = {};
    this.updateQueue = {};
    this.timers = {};
    
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

      // Handle encryption if needed - ONLY if the note is already locked or we're locking it now
      if (encryptionContext?.shouldEncrypt && 
          (currentNote.locked || updates.locked === true)) {
        if (typeof updatedNote.content === 'string') {
          updatedNote = await encryptNote(updatedNote, encryptionContext.password);
        }
      }

      // Clean up encryption fields if explicitly unlocked or not locked
      if (updates.locked === false || (!updatedNote.locked && !currentNote.locked)) {
        updatedNote.encrypted = false;
        updatedNote.keyParams = undefined;
        updatedNote.iv = undefined;
        updatedNote.visibleTitle = undefined;
      }

      // Save to local storage
      await storageService.writeNote(noteId, updatedNote);

      // Push update to server if authenticated
      if (this.authToken) {
        this.pushNoteToServer(updatedNote)
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
    // Skip update if there are no meaningful changes
    if (!this.hasChanges(noteId, updates)) {
      return;
    }

    // If unload is in progress, process immediately
    if (this.isProcessingUnload) {
      return this.processImmediateUpdate(noteId, updates, updateModified, encryptionContext);
    }

    // Check if the note is currently being synced; if so, delay this update
    if (this.isSyncing[noteId]) {
      console.log(`Note ${noteId} is currently syncing, delaying update`);
      setTimeout(() => this.queueUpdate(noteId, updates, updateModified, encryptionContext), 1000);
      return;
    }

    // Merge with any existing pending updates for this note
    const existingUpdates = this.pendingUpdates.get(noteId) || {};
    const mergedUpdates = { ...existingUpdates, ...updates };
    
    // Add lastSyncAttempt to help with rate limiting in SyncService
    mergedUpdates.lastSyncAttempt = Date.now();
    
    this.pendingUpdates.set(noteId, mergedUpdates);

    // Cancel any existing timer for this note
    if (this.updateTimers.has(noteId)) {
      clearTimeout(this.updateTimers.get(noteId));
    }

    // Set a new timer
    const timer = setTimeout(async () => {
      await this.processUpdate(noteId, updateModified, encryptionContext);
    }, 800); // Increased debounce time to reduce frequency

    this.updateTimers.set(noteId, timer);
  }

  // Process a queued update
  async processUpdate(noteId, updateModified = true, encryptionContext = null) {
    try {
      // Get current note state
      const currentNote = await storageService.readNote(noteId);
      if (!currentNote) return;

      // Get the final merged updates
      const finalUpdates = this.pendingUpdates.get(noteId) || {};
      this.pendingUpdates.delete(noteId);

      // Skip if no actual content changes - check again
      if (!this.hasChanges(noteId, finalUpdates)) {
        this.updateTimers.delete(noteId);
        return;
      }

      let updatedNote = {
        ...currentNote,
        ...finalUpdates,
        dateModified: updateModified ? new Date().toISOString() : currentNote.dateModified
      };

      // Handle encryption if needed - ONLY if the note is already locked or we're locking it now
      if (encryptionContext?.shouldEncrypt && 
          (currentNote.locked || finalUpdates.locked === true)) {
        if (typeof updatedNote.content === 'string') {
          updatedNote = await encryptNote(updatedNote, encryptionContext.password);
        }
      }

      // Clean up encryption fields if explicitly unlocked or not locked
      if (finalUpdates.locked === false || (!updatedNote.locked && !currentNote.locked)) {
        updatedNote.encrypted = false;
        updatedNote.keyParams = undefined;
        updatedNote.iv = undefined;
        updatedNote.visibleTitle = undefined;
      }

      // Save to local storage
      await storageService.writeNote(noteId, updatedNote);

      // Push update to server if authenticated
      if (this.authToken) {
        this.pushNoteToServer(updatedNote)
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
  }

  // Push a note update to the server if authenticated
  async pushNoteToServer(note) {
    try {
      // Skip sync for temporary notes
      if (note.temporary) {
        // console.log('Skipping server update for temporary note');
        return;
      }
      
      // Skip if not authenticated
      if (!this.authToken) {
        // console.log('Not authenticated, skipping server update');
        return;
      }
      
      // Skip if rate limiting is in effect
      if (this.isRateLimited(note.id)) {
        // console.log('Rate limited, skipping server update for now');
        return;
      }
      
      // Update rate limiting timestamp
      this.lastUpdateTime.set(note.id, Date.now());
      
      console.log(`Pushing note ${note.id} to server...`);
      
      try {
        // Use SyncService to handle the actual syncing
        const success = await syncService.syncNote(note.id);
        if (success) {
          console.log(`Successfully synced note ${note.id} to server`);
        } else {
          console.error(`Failed to sync note ${note.id} to server`);
        }
      } catch (error) {
        console.error(`Failed to push note ${note.id} to server:`, error);
        // Trigger a retry after the rate limit period if this was a network error
        if (error.message && error.message.includes('NetworkError')) {
          setTimeout(() => {
            if (this.authToken) { // Only retry if still authenticated
              console.log(`Retrying sync for note ${note.id} after network error`);
              syncService.syncNote(note.id).catch(retryError => {
                console.error(`Retry failed for note ${note.id}:`, retryError);
              });
            }
          }, this.UPDATE_RATE_LIMIT);
        }
      }
    } catch (error) {
      console.error(`Unexpected error in pushNoteToServer for note ${note?.id}:`, error);
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

  // Check if rate limiting is in effect for a note
  isRateLimited(noteId) {
    const lastTime = this.lastUpdateTime.get(noteId);
    if (!lastTime) return false;
    
    const now = Date.now();
    const elapsed = now - lastTime;
    
    // Rate limit updates to prevent excessive server calls
    return elapsed < this.UPDATE_RATE_LIMIT;
  }

  // Check if the update contains meaningful changes worth syncing
  hasChanges(noteId, updates) {
    if (!noteId || !updates) return true;

    // Always sync if content is changing
    if (updates.content !== undefined) {
      try {
        const currentNote = storageService.readNoteSync(noteId);
        // Compare with current content to see if there's an actual change
        if (currentNote && currentNote.content === updates.content) {
          // Content didn't actually change
          if (Object.keys(updates).length === 1 || 
              (Object.keys(updates).length === 2 && 'caretPosition' in updates)) {
            // If it's just content and/or caret position with no actual changes, skip
            return false;
          }
        }
      } catch (e) {
        console.warn('Error checking for changes:', e);
        // If we can't check, assume there are changes
        return true;
      }
    }

    // Check for meaningful metadata changes
    const significantFields = ['locked', 'encrypted', 'dateModified', 'pinned', 'tags', 'parentFolderId'];
    for (const field of significantFields) {
      if (field in updates) {
        try {
          const currentNote = storageService.readNoteSync(noteId);
          if (currentNote && JSON.stringify(currentNote[field]) !== JSON.stringify(updates[field])) {
            // There's a change in a significant field
            return true;
          }
        } catch (e) {
          // If we can't check, assume there are changes
          return true;
        }
      }
    }

    // If we have fields other than caretPosition, consider it a change
    const nonCaretFields = Object.keys(updates).filter(key => key !== 'caretPosition' && key !== 'lastSyncAttempt');
    return nonCaretFields.length > 0;
  }
}

export const noteUpdateService = new NoteUpdateService();