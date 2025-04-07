import { storageService } from './StorageService';
import { noteUpdateService } from './NoteUpdateService';

// API base URL for server endpoints
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://notes.peridot.software/v1' 
  : 'http://localhost:8000/api';

class SyncService {
  constructor() {
    this.syncStatus = new Map(); // Maps noteId -> { status, lastSynced, size }
    this.subscribers = new Set();
    this.backendStorage = {
      total: 100 * 1024 * 1024, // 100MB default
      used: 0
    };
    this.autoSyncEnabled = localStorage.getItem('autoSyncEnabled') === 'true';
    this.authToken = localStorage.getItem('authToken');
    
    // Status values: 'syncing', 'synced', 'failed', 'not-synced'
    
    // Set up broadcast channel for cross-tab communication
    this.setupBroadcastChannel();
    this.initializeFromLocalStorage();
    this.initializeWebsocket();
    this.setupAutoSync();
    
    // Fetch backend storage info if authenticated
    if (this.authToken) {
      this.fetchBackendStorageInfo();
    }
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
    // Only attempt to connect if we have authentication
    if (!this.authToken) return;

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = process.env.NODE_ENV === 'production'
        ? `${wsProtocol}//notes.peridot.software/ws/sync`
        : `${wsProtocol}//localhost:8000/ws/sync`;
      
      this.socket = new WebSocket(`${wsUrl}?token=${this.authToken}`);
      
      this.socket.onopen = () => {
        console.log('WebSocket connection established');
      };
      
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'NOTE_UPDATED' && data.noteId) {
            // Remote note was updated, update local status
            this.syncStatus.set(data.noteId, {
              status: 'synced',
              lastSynced: new Date().toISOString(),
              size: data.size || 0
            });
            
            this.notifySubscribers(data.noteId);
            
            // If we have the note open, fetch the latest version
            storageService.readNote(data.noteId).then(note => {
              if (note) {
                this.fetchNoteFromBackend(data.noteId);
              }
            });
          } else if (data.type === 'STORAGE_UPDATED') {
            // Update storage limits
            this.backendStorage = {
              total: data.total || this.backendStorage.total,
              used: data.used || this.backendStorage.used
            };
          }
        } catch (error) {
          console.error('Failed to process WebSocket message:', error);
        }
      };
      
      this.socket.onclose = () => {
        console.log('WebSocket connection closed');
        // Attempt to reconnect after a delay
        setTimeout(() => this.initializeWebsocket(), 5000);
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
    }
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
  
  // Fetch backend storage information
  async fetchBackendStorageInfo() {
    if (!this.authToken) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/storage/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      this.backendStorage = {
        total: data.total || this.backendStorage.total,
        used: data.used || this.backendStorage.used
      };
      
      return this.backendStorage;
    } catch (error) {
      console.error('Failed to fetch backend storage info:', error);
      return this.backendStorage;
    }
  }
  
  // Fetch a note from the backend
  async fetchNoteFromBackend(noteId) {
    if (!this.authToken) return null;
    
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${noteId}/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const noteData = await response.json();
      
      // Convert Django response format to frontend format if needed
      const processedNote = this.convertFromDjangoFormat(noteData);
      
      // Update local storage
      await storageService.writeNote(noteId, processedNote);
      
      // Update sync status
      this.syncStatus.set(noteId, {
        status: 'synced',
        lastSynced: new Date().toISOString(),
        size: new Blob([JSON.stringify(processedNote)]).size
      });
      
      this.notifySubscribers(noteId);
      this.broadcastSyncUpdate(noteId, this.syncStatus.get(noteId));
      
      return processedNote;
    } catch (error) {
      console.error(`Failed to fetch note ${noteId} from backend:`, error);
      return null;
    }
  }
  
  // Convert note from Django format to frontend format
  convertFromDjangoFormat(djangoNote) {
    // Django serializer already converts to camelCase, but some fields may need adjustment
    return {
      ...djangoNote,
      // If there are any specific field conversions needed, add them here
    };
  }
  
  // Convert note to Django format for sending to backend
  convertToDjangoFormat(note) {
    // Create a copy to avoid modifying the original
    const djangoNote = { ...note };
    
    // Handle caretPosition which isn't in the Django model
    if (djangoNote.caretPosition !== undefined) {
      // Keep it for frontend but it will be ignored by Django
    }
    
    // Handle dateCreated which isn't used in PUT/POST requests
    if (djangoNote.dateCreated !== undefined) {
      // Keep it for frontend but it will be ignored by Django
    }
    
    return djangoNote;
  }
  
  // Start syncing a note
  async syncNote(noteId) {
    try {
      // Check if we're authenticated
      if (!this.authToken) {
        throw new Error('Not authenticated');
      }
      
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
      
      // Calculate size in bytes
      const size = new Blob([JSON.stringify(note)]).size;
      
      // Check if we have enough space in backend
      if (size + this.backendStorage.used > this.backendStorage.total) {
        throw new Error('Not enough storage space in backend');
      }
      
      // Convert note to Django format
      const djangoNote = this.convertToDjangoFormat(note);
      
      // Send note to backend
      const response = await fetch(`${API_BASE_URL}/notes/${noteId}/`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(djangoNote)
      });
      
      // If note doesn't exist yet, create it
      if (response.status === 404) {
        const createResponse = await fetch(`${API_BASE_URL}/notes/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(djangoNote)
        });
        
        if (!createResponse.ok) {
          throw new Error(`HTTP error ${createResponse.status}`);
        }
      } else if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
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
      // Check if we're authenticated
      if (!this.authToken) {
        throw new Error('Not authenticated');
      }
      
      const currentStatus = this.syncStatus.get(noteId);
      
      if (currentStatus && currentStatus.status === 'synced') {
        // Request deletion from backend
        const response = await fetch(`${API_BASE_URL}/notes/${noteId}/`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok && response.status !== 404) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
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
  
  // Set authentication token
  setAuthToken(token) {
    this.authToken = token;
    localStorage.setItem('authToken', token);
    
    // Reinitialize websocket with new token
    if (this.socket) {
      this.socket.close();
    }
    this.initializeWebsocket();
    
    // Fetch backend storage info with new token
    this.fetchBackendStorageInfo();
  }
  
  // Clear authentication token
  clearAuthToken() {
    this.authToken = null;
    localStorage.removeItem('authToken');
    
    // Close websocket
    if (this.socket) {
      this.socket.close();
      this.socket = null;
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
    
    if (this.socket) {
      this.socket.close();
    }
  }
  
  // Sync all notes to the backend
  async syncAllNotes() {
    if (!this.authToken) {
      return { success: false, error: 'Not authenticated' };
    }
    
    try {
      const notes = await storageService.getAllNotes();
      const results = {
        total: notes.length,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: []
      };
      
      for (const note of notes) {
        // Skip notes that are already synced
        const status = this.getSyncStatus(note.id);
        if (status.status === 'synced') {
          results.skipped++;
          continue;
        }
        
        try {
          const success = await this.syncNote(note.id);
          if (success) {
            results.succeeded++;
          } else {
            results.failed++;
            results.errors.push({ id: note.id, error: 'Sync failed' });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({ id: note.id, error: error.message });
        }
      }
      
      return { success: true, results };
    } catch (error) {
      console.error('Failed to sync all notes:', error);
      return { success: false, error: error.message };
    }
  }
}

export const syncService = new SyncService(); 