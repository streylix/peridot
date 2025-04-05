import { storageService } from './StorageService';
import { noteUpdateService } from './NoteUpdateService';

class SyncService {
  constructor() {
    this.syncStatus = new Map(); // Maps noteId -> { status, lastSynced, size }
    this.subscribers = new Set();
    this.backendStorage = {
      total: 100 * 1024 * 1024, // 100MB default
      used: 0
    };
    this.autoSyncEnabled = localStorage.getItem('autoSyncEnabled') === 'true';
    
    // Status values: 'syncing', 'synced', 'failed', 'not-synced'
    
    // Set up broadcast channel for cross-tab communication
    this.setupBroadcastChannel();
    this.initializeFromLocalStorage();
    this.initializeWebsocket();
    this.setupAutoSync();
  }
  
  // Set up BroadcastChannel for real-time cross-tab communication
  setupBroadcastChannel() {
    try {
      this.broadcastChannel = new BroadcastChannel('peridot-sync-channel');
      
      this.broadcastChannel.onmessage = (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'NOTE_UPDATED':
            this.handleCrossBrowserNoteUpdate(data.noteId, data.note);
            break;
          case 'SYNC_STATUS_CHANGED':
            this.handleCrossBrowserSyncStatusChange(data.noteId, data.status);
            break;
        }
      };
    } catch (error) {
      console.error('BroadcastChannel not supported or failed to initialize:', error);
      // Fall back to localStorage events for cross-tab communication
    }
  }
  
  // Handle cross-browser note update
  async handleCrossBrowserNoteUpdate(noteId, noteData) {
    // Update the note in local storage without triggering additional events
    if (noteData) {
      try {
        // Check if we're currently viewing this note by asking any subscribers
        const currentNote = await storageService.readNote(noteId);
        if (currentNote) {
          // Update the note in memory
          const event = new CustomEvent('noteUpdate', {
            detail: { note: noteData }
          });
          window.dispatchEvent(event);
        }
      } catch (error) {
        console.error('Failed to process cross-browser note update:', error);
      }
    }
  }
  
  // Handle cross-browser sync status change
  handleCrossBrowserSyncStatusChange(noteId, status) {
    if (noteId && status) {
      this.syncStatus.set(noteId, status);
      this.notifySubscribers(noteId);
    }
  }
  
  // Initialize from localStorage or other persistent storage
  initializeFromLocalStorage() {
    try {
      const savedSyncData = localStorage.getItem('syncMetadata');
      if (savedSyncData) {
        const parsedData = JSON.parse(savedSyncData);
        
        // Load backend storage data
        if (parsedData.backendStorage) {
          this.backendStorage = parsedData.backendStorage;
        }
        
        // Load note sync statuses
        if (parsedData.noteStatuses) {
          Object.entries(parsedData.noteStatuses).forEach(([noteId, status]) => {
            this.syncStatus.set(noteId, status);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load sync data from localStorage:', error);
    }
  }
  
  // Setup auto-sync event listener
  setupAutoSync() {
    // Listen for note update events
    window.addEventListener('noteUpdate', this.handleNoteUpdate.bind(this));
  }
  
  // Handle auto-sync when a note is updated
  async handleNoteUpdate(event) {
    if (!this.autoSyncEnabled) return;
    
    const updatedNote = event.detail.note;
    if (!updatedNote || !updatedNote.id) return;
    
    // Check if this is just a caret position update or other minor update
    // that shouldn't trigger a sync
    const isMinorUpdate = this.isMinorNoteUpdate(updatedNote);
    if (isMinorUpdate) {
      return;
    }
    
    // Implement cooldown to prevent excessive syncing
    const noteId = updatedNote.id;
    const now = Date.now();
    if (this.lastSyncTime && this.lastSyncTime[noteId] && 
        now - this.lastSyncTime[noteId] < 10000) { // 10 second cooldown
      return;
    }
    
    // Broadcast the note update to other tabs
    this.broadcastNoteUpdate(updatedNote.id, updatedNote);
    
    // Check if this note is already synced
    const status = this.getSyncStatus(updatedNote.id);
    if (status && status.status === 'synced') {
      // Auto-sync the updated note
      await this.syncNote(updatedNote.id);
      
      // Update last sync time
      if (!this.lastSyncTime) {
        this.lastSyncTime = {};
      }
      this.lastSyncTime[noteId] = now;
    }
  }
  
  // Determine if an update is minor (like just caret position)
  isMinorNoteUpdate(updatedNote) {
    // If we have a previous version of this note stored
    const noteId = updatedNote.id;
    if (!this.previousNoteState) {
      this.previousNoteState = {};
    }
    
    const previousState = this.previousNoteState[noteId];
    if (!previousState) {
      // Store current state for future comparison
      this.previousNoteState[noteId] = this.sanitizeNoteForComparison(updatedNote);
      return false;
    }
    
    // Create sanitized versions for comparison
    const sanitizedPrevious = previousState;
    const sanitizedCurrent = this.sanitizeNoteForComparison(updatedNote);
    
    // Compare the essential content
    const isContentSame = sanitizedPrevious.content === sanitizedCurrent.content;
    
    // Update previous state for next comparison
    this.previousNoteState[noteId] = sanitizedCurrent;
    
    // If content is the same, it's a minor update
    return isContentSame;
  }
  
  // Remove fields that change frequently but don't affect sync needs
  sanitizeNoteForComparison(note) {
    const { content, title, locked } = note;
    return { 
      id: note.id,
      content, 
      title, 
      locked
    };
  }
  
  // Broadcast note update to other tabs
  broadcastNoteUpdate(noteId, noteData) {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'NOTE_UPDATED',
          data: {
            noteId,
            note: noteData
          }
        });
      } else {
        // Fallback to localStorage
        localStorage.setItem('note_update', JSON.stringify({
          noteId,
          note: noteData,
          timestamp: Date.now()
        }));
        // Clear it immediately to allow future updates to trigger events
        setTimeout(() => localStorage.removeItem('note_update'), 100);
      }
    } catch (error) {
      console.error('Failed to broadcast note update:', error);
    }
  }
  
  // Set auto-sync flag
  setAutoSync(enabled) {
    this.autoSyncEnabled = enabled;
  }
  
  // Save sync metadata to localStorage
  persistSyncData() {
    try {
      const syncData = {
        backendStorage: this.backendStorage,
        noteStatuses: Object.fromEntries(this.syncStatus)
      };
      
      localStorage.setItem('syncMetadata', JSON.stringify(syncData));
    } catch (error) {
      console.error('Failed to persist sync data:', error);
    }
  }
  
  // Set up websocket connection for real-time updates
  initializeWebsocket() {
    // In a real implementation, this would connect to a WebSocket server
    // For now, we'll simulate cross-tab communication using localStorage events
    window.addEventListener('storage', (event) => {
      if (event.key === 'sync_update') {
        try {
          const updateData = JSON.parse(event.newValue);
          if (updateData && updateData.noteId) {
            this.syncStatus.set(updateData.noteId, updateData.status);
            this.notifySubscribers(updateData.noteId);
          }
        } catch (error) {
          console.error('Failed to process sync update:', error);
        }
      } else if (event.key === 'note_update') {
        try {
          const updateData = JSON.parse(event.newValue);
          if (updateData && updateData.noteId && updateData.note) {
            this.handleCrossBrowserNoteUpdate(updateData.noteId, updateData.note);
          }
        } catch (error) {
          console.error('Failed to process note update from localStorage:', error);
        }
      }
    });
  }
  
  // Subscribe to sync status changes
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  // Notify all subscribers about a sync status change
  notifySubscribers(noteId) {
    const status = this.syncStatus.get(noteId);
    this.subscribers.forEach(callback => callback(noteId, status));
    
    // Also dispatch a DOM event for components that aren't directly subscribed
    window.dispatchEvent(new CustomEvent('syncStatusUpdate', {
      detail: { noteId, status }
    }));
  }
  
  // Broadcast sync update to other tabs
  broadcastSyncUpdate(noteId, status) {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'SYNC_STATUS_CHANGED',
          data: {
            noteId,
            status
          }
        });
      } else {
        // Fallback to localStorage
        localStorage.setItem('sync_update', JSON.stringify({ 
          noteId, 
          status,
          timestamp: Date.now()
        }));
        // Clear it immediately to allow future updates to trigger events
        setTimeout(() => localStorage.removeItem('sync_update'), 100);
      }
    } catch (error) {
      console.error('Failed to broadcast sync update:', error);
    }
  }
  
  // Get sync status for a specific note
  getSyncStatus(noteId) {
    return this.syncStatus.get(noteId) || { 
      status: 'not-synced',
      lastSynced: null,
      size: 0
    };
  }
  
  // Get all synced notes with their metadata
  getAllSyncedNotes() {
    const syncedNotes = [];
    
    for (const [noteId, status] of this.syncStatus.entries()) {
      if (status.status === 'synced') {
        syncedNotes.push({
          id: noteId,
          ...status
        });
      }
    }
    
    return syncedNotes;
  }
  
  // Start syncing a note
  async syncNote(noteId) {
    try {
      // Update status to syncing
      this.syncStatus.set(noteId, {
        status: 'syncing',
        lastSynced: null,
        size: 0
      });
      this.notifySubscribers(noteId);
      this.broadcastSyncUpdate(noteId, this.syncStatus.get(noteId));
      
      // Get the note
      const note = await storageService.readNote(noteId);
      if (!note) {
        throw new Error('Note not found');
      }
      
      // Calculate size in bytes (approximation for demo)
      const size = new Blob([JSON.stringify(note)]).size;
      
      // Check if we have enough space in backend
      if (size + this.backendStorage.used > this.backendStorage.total) {
        throw new Error('Not enough storage space in backend');
      }
      
      // Simulate API call with timeout
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update status to synced
      this.syncStatus.set(noteId, {
        status: 'synced',
        lastSynced: new Date().toISOString(),
        size
      });
      
      // Update storage usage
      this.backendStorage.used += size;
      
      this.notifySubscribers(noteId);
      this.broadcastSyncUpdate(noteId, this.syncStatus.get(noteId));
      this.persistSyncData();
      
      return true;
    } catch (error) {
      console.error(`Failed to sync note ${noteId}:`, error);
      
      // Update status to failed
      this.syncStatus.set(noteId, {
        status: 'failed',
        lastSynced: null,
        error: error.message
      });
      
      this.notifySubscribers(noteId);
      this.broadcastSyncUpdate(noteId, this.syncStatus.get(noteId));
      this.persistSyncData();
      
      return false;
    }
  }
  
  // Remove a note from backend sync
  async removeFromSync(noteId) {
    try {
      const currentStatus = this.syncStatus.get(noteId);
      
      if (currentStatus && currentStatus.status === 'synced') {
        // Reduce backend usage
        this.backendStorage.used -= currentStatus.size || 0;
        
        // Update status to not-synced
        this.syncStatus.set(noteId, {
          status: 'not-synced',
          lastSynced: null,
          size: 0
        });
        
        this.notifySubscribers(noteId);
        this.broadcastSyncUpdate(noteId, this.syncStatus.get(noteId));
        this.persistSyncData();
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to remove note ${noteId} from sync:`, error);
      return false;
    }
  }
  
  // Get backend storage stats
  getBackendStorageStats() {
    return {
      total: this.backendStorage.total,
      used: this.backendStorage.used,
      available: this.backendStorage.total - this.backendStorage.used,
      percentUsed: (this.backendStorage.used / this.backendStorage.total) * 100
    };
  }
  
  // Cleanup resources on unmount
  cleanup() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
  }
}

export const syncService = new SyncService(); 