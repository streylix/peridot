import { storageService } from './StorageService';
import { noteUpdateService } from './NoteUpdateService';

// API base URL for server endpoints
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://notes.peridot.software/api' 
  : '/api';

class SyncService {
  constructor() {
    this.syncStatus = new Map(); // Maps noteId -> { status, lastSynced, size }
    this.subscribers = new Set();
    this.backendStorage = {
      total: 100 * 1024 * 1024, // 100MB default
      used: 0
    };
    this.autoSyncEnabled = localStorage.getItem('autoSyncEnabled') === 'true';
    this.currentUserId = localStorage.getItem('currentUserId');
    
    // Status values: 'syncing', 'synced', 'failed', 'not-synced'
    
    // Set up broadcast channel for cross-tab communication
    this.setupBroadcastChannel();
    this.initializeFromLocalStorage();
    this.initializeWebsocket();
    this.setupAutoSync();
    
    // Fetch backend storage info if authenticated
    if (this.currentUserId) {
      this.fetchBackendStorageInfo();
    }
  }
  
  // Set up broadcast channel for cross-tab sync
  setupBroadcastChannel() {
    try {
      if ('BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('sync_channel');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data.type === 'SYNC_STATUS_CHANGED') {
            const { noteId, status } = event.data.data;
            this.syncStatus.set(noteId, status);
            this.notifySubscribers(noteId);
          }
        };
      } else {
        // Fallback for browsers that don't support BroadcastChannel
        console.log('BroadcastChannel not supported in this browser, using localStorage fallback');
        
        // Check for localStorage events for sync updates
        window.addEventListener('storage', (event) => {
          if (event.key === 'sync_update') {
            try {
              const data = JSON.parse(event.newValue);
              if (data && data.noteId && data.status) {
                this.syncStatus.set(data.noteId, data.status);
                this.notifySubscribers(data.noteId);
              }
            } catch (error) {
              console.error('Failed to process sync update:', error);
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to set up broadcast channel:', error);
    }
  }
  
  // Initialize websocket connection for real-time sync updates
  initializeWebsocket() {
    // If we're in development, don't set up the websocket
    if (process.env.NODE_ENV !== 'production') {
      return;
    }
    
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/ws/sync/`;
      
      this.syncSocket = new WebSocket(wsUrl);
      
      this.syncSocket.onopen = () => {
        console.log('Sync websocket connected');
        
        // Authenticate the websocket connection
        if (this.currentUserId) {
          this.syncSocket.send(JSON.stringify({
            type: 'authenticate',
            userId: this.currentUserId
          }));
        }
      };
      
      this.syncSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'sync_update') {
            const { noteId, status } = data;
            this.syncStatus.set(noteId, status);
            this.notifySubscribers(noteId);
          }
        } catch (error) {
          console.error('Failed to process sync websocket message:', error);
        }
      };
      
      this.syncSocket.onclose = () => {
        console.log('Sync websocket disconnected');
        
        // Try to reconnect after a delay
        setTimeout(() => this.initializeWebsocket(), 5000);
      };
      
      this.syncSocket.onerror = (error) => {
        console.error('Sync websocket error:', error);
      };
    } catch (error) {
      console.error('Failed to initialize sync websocket:', error);
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
  
  // Setup auto-sync functionality
  setupAutoSync() {
    // Clear any existing subscription before creating a new one
    if (this.noteUpdateSubscription) {
      this.noteUpdateSubscription();
      this.noteUpdateSubscription = null;
      console.log('Cleared previous auto-sync subscription');
    }
    
    // Only set up subscription if autosync is enabled
    if (this.autoSyncEnabled) {
      console.log('Setting up auto-sync subscription, auth status:', !!this.currentUserId);
      // Subscribe to note updates to automatically sync
      this.noteUpdateSubscription = noteUpdateService.subscribe((note) => {
        const noteId = note?.id;
        console.log(`Auto-sync triggered for note ${noteId}`, {
          currentUserId: this.currentUserId,
          autoSyncEnabled: this.autoSyncEnabled,
          isTemporary: note?.temporary,
          authToken: !!noteUpdateService.authToken
        });
        
        if (this.currentUserId && note && noteId) {
          // Check if auto-sync enabled and not a temporary note
          if (this.autoSyncEnabled && !note.temporary) {
            console.log(`Auto-syncing note ${noteId}`);
            this.syncNote(noteId).catch(error => {
              console.error(`Auto-sync failed for note ${noteId}:`, error);
            });
          }
        }
      });
    } else {
      console.log('Auto-sync is disabled, not setting up subscription');
    }
  }
  
  // Save sync data to localStorage
  persistSyncData() {
    try {
      // Convert Map to object for storage
      const noteStatuses = {};
      for (const [noteId, status] of this.syncStatus.entries()) {
        noteStatuses[noteId] = status;
      }
      
      const dataToSave = {
        backendStorage: this.backendStorage,
        noteStatuses
      };
      
      localStorage.setItem('syncMetadata', JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Failed to persist sync data:', error);
    }
  }
  
  // Subscribe to sync status changes
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  // Notify subscribers of sync status changes
  notifySubscribers(noteId) {
    this.subscribers.forEach(callback => callback(noteId));
  }
  
  // Fetch backend storage info
  async fetchBackendStorageInfo() {
    if (!this.currentUserId) {
      return;
    }
    
    // Check if we've fetched recently (within the last 1 minute) to reduce API spam
    const now = Date.now();
    if (this._lastStorageInfoFetch && now - this._lastStorageInfoFetch < 60000) {
      return this.backendStorage;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/storage/info/`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.backendStorage = {
          total: data.total_bytes || 100 * 1024 * 1024, // Use server value or default to 100MB
          used: data.used_bytes || 0
        };
        
        // Persist the updated storage info
        this.persistSyncData();
        
        // Update timestamp of last fetch
        this._lastStorageInfoFetch = now;
        
        // Notify subscribers of the changed storage
        this.notifySubscribers(null);
        
        return this.backendStorage;
      } else {
        console.error('Failed to fetch backend storage info:', response.status);
        return this.backendStorage;
      }
    } catch (error) {
      console.error('Failed to fetch backend storage info:', error);
      return this.backendStorage;
    }
  }
  
  // Get backend storage stats
  getBackendStorageStats() {
    const { total, used } = this.backendStorage;
    const available = Math.max(0, total - used);
    const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
    
    return {
      total,
      used,
      available,
      percentUsed,
      // For human-readable formats
      totalFormatted: this.formatBytes(total),
      usedFormatted: this.formatBytes(used),
      availableFormatted: this.formatBytes(available)
    };
  }
  
  // Format bytes to human-readable format
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  // Set auto-sync flag
  setAutoSync(enabled) {
    this.autoSyncEnabled = enabled;
    localStorage.setItem('autoSyncEnabled', enabled.toString());
    
    // Reconfigure the auto-sync setup based on new setting
    this.setupAutoSync();
  }
  
  // Set authentication token (handled via session cookies now)
  setAuthToken(userId) {
    this.currentUserId = userId;
    
    // If auth state changed, update stuff
    if (userId) {
      // Also set auth token in noteUpdateService to enable auto-syncing
      const authToken = localStorage.getItem('authToken');
      if (authToken) {
        noteUpdateService.setAuthToken(authToken);
      }
      
      this.fetchBackendStorageInfo();
      this.initializeWebsocket();
    } else {
      // Clear auth token in noteUpdateService
      noteUpdateService.clearAuthToken();
      
      // Clear sync statuses
      this.syncStatus.clear();
      this.persistSyncData();
      this.notifySubscribers(null);
    }
  }
  
  // Sync a modified note if dirty flag is set
  async syncIfDirty(noteId) {
    const status = this.syncStatus.get(noteId);
    
    if (status && status.dirty) {
      return await this.syncNote(noteId);
    }
    
    return true;
  }
  
  // Mark a note as dirty (needs sync)
  markDirty(noteId) {
    const status = this.syncStatus.get(noteId) || {
      status: 'not-synced',
      lastSynced: null,
      size: 0
    };
    
    status.dirty = true;
    this.syncStatus.set(noteId, status);
    this.persistSyncData();
    this.notifySubscribers(noteId);
    
    // If auto-sync enabled, sync the note right away
    if (this.autoSyncEnabled && this.currentUserId) {
      this.syncNote(noteId).catch(error => {
        console.error(`Auto-sync failed for note ${noteId}:`, error);
      });
    }
  }
  
  // Convert note to Django format for backend storage
  convertToDjangoFormat(note) {
    return {
      id: note.id,
      content: note.content,
      date_created: note.dateCreated,
      date_modified: note.dateModified,
      locked: note.locked || false,
      encrypted: note.encrypted || false,
      folder_path: note.folderPath || '',
      pinned: note.pinned || false,
      visible_title: note.visibleTitle || '',
      tags: note.tags || []
    };
  }
  
  // Convert from Django format to our format
  convertFromDjangoFormat(note) {
    return {
      id: note.id,
      content: note.content,
      dateCreated: note.date_created,
      dateModified: note.date_modified,
      locked: note.locked || false,
      encrypted: note.encrypted || false,
      folderPath: note.folder_path || '',
      pinned: note.pinned || false,
      visibleTitle: note.visible_title || '',
      tags: note.tags || []
    };
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
      // Check if we're authenticated
      if (!this.currentUserId) {
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
        credentials: 'include', // Include cookies for session auth
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(djangoNote)
      });
      
      // If note doesn't exist yet, create it
      if (response.status === 404) {
        const createResponse = await fetch(`${API_BASE_URL}/notes/`, {
          method: 'POST',
          credentials: 'include', // Include cookies for session auth
          headers: {
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
      if (!this.currentUserId) {
        throw new Error('Not authenticated');
      }
      
      const currentStatus = this.syncStatus.get(noteId);
      
      if (currentStatus && currentStatus.status === 'synced') {
        // Request deletion from backend
        const response = await fetch(`${API_BASE_URL}/notes/${noteId}/`, {
          method: 'DELETE',
          credentials: 'include', // Include cookies for session auth
          headers: {
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
  
  // Sync all notes to the backend
  async syncAllNotes() {
    if (!this.currentUserId) {
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

  // Fetch all notes from the backend
  async fetchNotesFromBackend() {
    if (!this.currentUserId) {
      console.error('Cannot fetch notes: Not authenticated');
      return { success: false, error: 'Not authenticated', notes: [] };
    }
    
    try {
      console.log('Fetching notes from backend...');
      const response = await fetch(`${API_BASE_URL}/notes/`, {
        method: 'GET',
        credentials: 'include', // Include cookies for session auth
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const backendNotes = await response.json();
      console.log(`Fetched ${backendNotes.length} notes from backend`);
      
      // Convert notes to local format
      const localNotes = [];
      for (const backendNote of backendNotes) {
        try {
          const localNote = this.convertFromDjangoFormat(backendNote);
          
          // Update sync status for this note
          this.syncStatus.set(localNote.id, {
            status: 'synced',
            lastSynced: new Date().toISOString(),
            size: new Blob([JSON.stringify(localNote)]).size
          });
          
          localNotes.push(localNote);
        } catch (error) {
          console.error(`Failed to convert note ${backendNote.id}:`, error);
        }
      }
      
      // Save updated sync statuses
      this.persistSyncData();
      
      return { 
        success: true, 
        notes: localNotes,
        count: localNotes.length
      };
    } catch (error) {
      console.error('Failed to fetch notes from backend:', error);
      return { 
        success: false, 
        error: error.message,
        notes: []
      };
    }
  }

  // Get all notes directly from the backend and update sync status
  async getNotesFromBackend() {
    try {
      const result = await this.fetchNotesFromBackend();
      
      if (!result.success) {
        console.error('Failed to get notes from backend:', result.error);
        return [];
      }
      
      // Update the sync status of notes that exist in local storage but not in the backend
      // by marking them as not-synced if they were previously synced
      const backendNoteIds = new Set(result.notes.map(note => note.id));
      
      // Check all current synced notes
      for (const [noteId, status] of this.syncStatus.entries()) {
        if (status.status === 'synced' && !backendNoteIds.has(noteId)) {
          // This note was synced but is no longer on the backend
          this.syncStatus.set(noteId, {
            status: 'not-synced',
            lastSynced: null,
            size: 0
          });
        }
      }
      
      // Persist updated sync statuses
      this.persistSyncData();
      this.notifySubscribers();
      
      return result.notes;
    } catch (error) {
      console.error('Failed to get notes from backend:', error);
      return [];
    }
  }

  // Merge backend notes with local notes
  async mergeBackendWithLocalNotes() {
    try {
      const { success, notes: backendNotes, error } = await this.fetchNotesFromBackend();
      
      if (!success) {
        console.error('Failed to merge notes:', error);
        return { success: false, error };
      }
      
      if (backendNotes.length === 0) {
        console.log('No backend notes to merge');
        return { success: true, added: 0, updated: 0 };
      }
      
      console.log(`Processing ${backendNotes.length} backend notes for merge`);
      
      // Get all local notes
      const localNotes = await storageService.getAllNotes();
      const localNoteIds = new Set(localNotes.map(note => note.id));
      
      let added = 0;
      let updated = 0;
      
      // Process each backend note
      for (const backendNote of backendNotes) {
        if (localNoteIds.has(backendNote.id)) {
          // Note exists locally - Always update with server version
          await storageService.writeNote(backendNote.id, backendNote);
          updated++;
          
          // Update sync status to reflect the sync
          this.syncStatus.set(backendNote.id, {
            status: 'synced',
            lastSynced: new Date().toISOString(),
            size: new Blob([JSON.stringify(backendNote)]).size
          });
        } else {
          // Note doesn't exist locally, add it
          await storageService.writeNote(backendNote.id, backendNote);
          added++;
          
          // Set sync status for the new note
          this.syncStatus.set(backendNote.id, {
            status: 'synced',
            lastSynced: new Date().toISOString(),
            size: new Blob([JSON.stringify(backendNote)]).size
          });
        }
      }
      
      // Persist updated sync statuses
      this.persistSyncData();
      
      // Notify subscribers of changes
      this.notifySubscribers();
      
      console.log(`Merge complete: Added ${added} notes, updated ${updated} notes`);
      return { success: true, added, updated };
    } catch (error) {
      console.error('Error merging backend notes:', error);
      return { success: false, error: error.message };
    }
  }
}

export const syncService = new SyncService(); 