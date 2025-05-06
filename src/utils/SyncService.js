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
    this.currentUserId = localStorage.getItem('currentUserId');
    
    // Status values: 'syncing', 'synced', 'failed', 'not-synced'
    
    // Set up broadcast channel for cross-tab communication
    this.setupBroadcastChannel();
    this.initializeFromLocalStorage();
    this.initializeWebsocket();
    this.setupNoteUpdateListener();
    
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
    try {
      // Determine WebSocket URL - use wss in production, ws in development
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      
      // In development, connect to the Django dev server
      // In production, use the same host as the main site
      const host = process.env.NODE_ENV === 'production' 
        ? window.location.host
        : 'localhost:8000';
        
      const wsUrl = `${protocol}//${host}/ws/sync/`;
      
      console.log(`Connecting to WebSocket at ${wsUrl}`);
      
      // Close any existing connection
      if (this.syncSocket && this.syncSocket.readyState !== WebSocket.CLOSED) {
        this.syncSocket.close();
      }
      
      this.syncSocket = new WebSocket(wsUrl);
      
      // Set up connection handlers
      this.syncSocket.onopen = this.handleSocketOpen.bind(this);
      this.syncSocket.onmessage = this.handleSocketMessage.bind(this);
      this.syncSocket.onclose = this.handleSocketClose.bind(this);
      this.syncSocket.onerror = this.handleSocketError.bind(this);
      
      // Track connection state
      this.isWebSocketConnected = false;
      
      // Set up reconnection logic
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 5;
      this.reconnectDelay = 5000; // Start with 5 seconds
    } catch (error) {
      console.error('Failed to initialize sync websocket:', error);
    }
  }
  
  // WebSocket event handlers
  handleSocketOpen() {
    console.log('WebSocket connection established');
    this.isWebSocketConnected = true;
    this.reconnectAttempts = 0;
    
    // Authenticate the WebSocket connection if we have a user ID
    if (this.currentUserId) {
      this.authenticateSocket();
    }
  }
  
  authenticateSocket() {
    if (this.syncSocket && this.syncSocket.readyState === WebSocket.OPEN && this.currentUserId) {
      console.log(`Authenticating WebSocket with user ID: ${this.currentUserId}`);
      
      this.syncSocket.send(JSON.stringify({
        type: 'authenticate',
        userId: this.currentUserId
      }));
    }
  }
  
  handleSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);
      
      switch (data.type) {
        case 'connection_established':
          console.log('WebSocket server connection confirmed');
          break;
          
        case 'authenticated':
          console.log('WebSocket authentication successful');
          break;
          
        case 'sync_update':
          // Update sync status for a specific note
          if (data.noteId) {
            console.log(`Received sync update for note ${data.noteId} from WebSocket`);
            
            // Update the sync status
            this.syncStatus.set(data.noteId, data.status);
            this.persistSyncData();
            
            // Check if we need to update the local note
            const updateLocalNote = async () => {
              try {
                // First check if we have a local copy that's decrypted
                const localNote = await storageService.readNote(data.noteId);
                
                // If we have a local decrypted note, and the incoming note is encrypted,
                // don't overwrite our decrypted state
                if (
                  localNote && 
                  // Check for any of our decryption flags
                  ((localNote.persistentDecrypted || !localNote.encrypted || !localNote.locked) &&
                  (localNote.wasDecrypted || localNote.persistentDecrypted)) &&
                  // And confirm the server version is encrypted
                  data.noteContent && data.noteContent.encrypted && data.noteContent.locked
                ) {
                  console.log(`WebSocket: Preserving local decrypted state for note ${data.noteId}`);
                  
                  // Just update metadata, not the content or encryption state
                  const preservedNote = {
                    ...localNote,
                    // Take some fields from server version
                    dateModified: data.noteContent.dateModified || localNote.dateModified,
                    folderPath: data.noteContent.folderPath || localNote.folderPath,
                    pinned: data.noteContent.pinned !== undefined ? data.noteContent.pinned : localNote.pinned,
                    tags: data.noteContent.tags || localNote.tags
                  };
                  
                  await storageService.writeNote(data.noteId, preservedNote);
                  console.log(`WebSocket: Updated metadata for note ${data.noteId} while preserving decrypted state`);
                  return;
                }
                
                // Otherwise proceed with normal update
                if (data.noteContent) {
                  console.log(`Updating local note ${data.noteId} from WebSocket with content`);
                  this.updateLocalNoteFromServer(data.noteId, data.noteContent)
                    .then(() => console.log(`Local note ${data.noteId} updated from WebSocket`))
                    .catch(error => console.error(`Failed to update local note ${data.noteId}:`, error));
                } else {
                  // If no content, just refresh from server
                  this.fetchNoteFromServer(data.noteId)
                    .then(success => {
                      if (success) {
                        console.log(`Fetched note ${data.noteId} from server after WebSocket update`);
                      }
                    })
                    .catch(error => console.error(`Failed to fetch note ${data.noteId} from server:`, error));
                }
              } catch (error) {
                console.error(`Error handling WebSocket update for note ${data.noteId}:`, error);
              }
            };
            
            updateLocalNote();
            
            // Notify subscribers about the sync status change
            this.notifySubscribers(data.noteId);
          }
          break;
          
        case 'storage_update':
          // Update storage information
          if (data.storage) {
            this.backendStorage = {
              total: data.storage.total_bytes,
              used: data.storage.used_bytes
            };
            this.persistSyncData();
            this.notifySubscribers(null); // Notify all subscribers
          }
          break;
          
        case 'error':
          console.error('WebSocket error:', data.message);
          break;
          
        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('Failed to process WebSocket message:', error);
    }
  }
  
  handleSocketClose(event) {
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    this.isWebSocketConnected = false;
    
    // Attempt to reconnect if appropriate
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (this.currentUserId) { // Only reconnect if we still have a user
          this.reconnectAttempts++;
          this.initializeWebsocket();
        }
      }, delay);
    } else {
      console.error('Maximum WebSocket reconnection attempts reached');
    }
  }
  
  handleSocketError(error) {
    console.error('WebSocket error:', error);
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
  
  // Setup note update listener (replacing the old autoSync setup)
  setupNoteUpdateListener() {
    // Clear any existing subscription
    if (this.noteUpdateSubscription) {
      this.noteUpdateSubscription();
      this.noteUpdateSubscription = null;
    }
    
    console.log('Setting up note update listener for automatic syncing');
    
    // Subscribe to note updates to automatically sync any synced notes
    this.noteUpdateSubscription = noteUpdateService.subscribe((note) => {
      if (!this.currentUserId || !note || !note.id) return;
      
      const noteId = note.id;
      const currentStatus = this.getSyncStatus(noteId);
      
      // Always sync if the note is already in 'synced' status
      // This makes syncing automatic for any note that's already been synced
      if (currentStatus.status === 'synced' && !note.temporary) {
        console.log(`Auto-syncing note ${noteId} because it's already synced`);
        this.syncNote(noteId).catch(error => {
          console.error(`Auto-sync failed for note ${noteId}:`, error);
        });
      }
    });
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
      
      // Initialize or reinitialize the WebSocket connection
      this.initializeWebsocket();
      // Reset note update listener
      this.setupNoteUpdateListener();
    } else {
      // Clear auth token in noteUpdateService
      noteUpdateService.clearAuthToken();
      
      // Close WebSocket if it's open
      if (this.syncSocket && this.syncSocket.readyState !== WebSocket.CLOSED) {
        this.syncSocket.close();
      }
      
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
    
    // Always sync immediately if the note is already in 'synced' status
    // This replaces the old auto-sync check
    if (status.status === 'synced' && this.currentUserId) {
      this.syncNote(noteId).catch(error => {
        console.error(`Sync failed for note ${noteId}:`, error);
      });
    }
  }
  
  // Convert note to Django format for backend storage
  convertToDjangoFormat(note) {
    const djangoNote = {
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

    // For encrypted notes, make sure we include encryption metadata
    // Convert camelCase to snake_case for Django
    if (note.encrypted && note.locked) {
      // Ensure keyParams is properly formatted
      djangoNote.key_params = {
        salt: Array.isArray(note.keyParams.salt) 
          ? note.keyParams.salt 
          : Array.from(note.keyParams.salt),
        iterations: note.keyParams.iterations
      };
      
      // Ensure IV is properly formatted
      djangoNote.iv = Array.isArray(note.iv) 
        ? note.iv 
        : Array.from(note.iv);
        
      // Ensure content is properly formatted if it's an encrypted array
      if (Array.isArray(note.content)) {
        djangoNote.content = note.content;
      } else if (note.content instanceof Uint8Array) {
        djangoNote.content = Array.from(note.content);
      }
    }

    return djangoNote;
  }
  
  // Convert from Django format to our format
  convertFromDjangoFormat(note) {
    const localNote = {
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

    // For encrypted notes, make sure we include encryption metadata
    // Convert snake_case to camelCase for JavaScript
    if (note.encrypted && note.locked) {
      // Ensure the arrays are properly formatted for Web Crypto API
      localNote.keyParams = {
        salt: Array.isArray(note.key_params.salt) 
          ? note.key_params.salt 
          : Array.from(note.key_params.salt),
        iterations: note.key_params.iterations
      };
      
      localNote.iv = Array.isArray(note.iv) 
        ? note.iv 
        : Array.from(note.iv);
      
      // Ensure content is also properly formatted as an array
      if (Array.isArray(note.content)) {
        localNote.content = note.content;
      } else if (typeof note.content === 'object' && note.content !== null) {
        // Handle case where content might be a buffer or typed array
        localNote.content = Array.from(note.content);
      }
      // else content remains as is (string or other format)
    }

    return localNote;
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
      
      // IMPORTANT: Check if this is a decrypted note that was previously encrypted
      // If so, we need to re-encrypt it before sending to the server
      let noteToSync = note;
      if (note.wasDecrypted && !note.encrypted && !note.locked) {
        console.log(`Note ${noteId} was previously decrypted - re-encrypting for sync`);
        
        try {
          // Import reEncryptNote function
          const { reEncryptNote } = await import('./encryption');
          
          // Re-encrypt the note
          const reEncrypted = await reEncryptNote(note);
          
          // If re-encryption succeeded, use that for syncing
          if (reEncrypted.encrypted && reEncrypted.locked) {
            console.log(`Re-encryption successful for note ${noteId}`);
            noteToSync = reEncrypted;
          } else {
            console.warn(`Re-encryption failed for note ${noteId} - will sync decrypted version`);
          }
        } catch (error) {
          console.error(`Error re-encrypting note ${noteId}:`, error);
          // Continue with the original note
        }
      }
      
      // Calculate size in bytes
      const size = new Blob([JSON.stringify(noteToSync)]).size;
      
      // Check if we have enough space in backend
      if (size + this.backendStorage.used > this.backendStorage.total) {
        throw new Error('Not enough storage space in backend');
      }
      
      // Convert note to Django format
      const djangoNote = this.convertToDjangoFormat(noteToSync);
      
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
      let preserved = 0;
      
      // Process each backend note
      for (const backendNote of backendNotes) {
        if (localNoteIds.has(backendNote.id)) {
          // Note exists locally
          const localNote = localNotes.find(n => n.id === backendNote.id);
          
          // IMPORTANT: Don't overwrite a decrypted note with an encrypted one
          if (
            // Check for any of our decryption flags
            ((localNote.persistentDecrypted || !localNote.encrypted || !localNote.locked) &&
            (localNote.wasDecrypted || localNote.persistentDecrypted)) &&
            // And confirm the server version is encrypted
            backendNote.encrypted && backendNote.locked
          ) {
            console.log(`Preserving local decrypted state for note ${backendNote.id} during merge`);
            
            // Just update metadata, not the content or encryption state
            const preservedNote = {
              ...localNote,
              // Take some fields from server version
              dateModified: backendNote.dateModified || localNote.dateModified,
              folderPath: backendNote.folderPath || localNote.folderPath,
              pinned: backendNote.pinned !== undefined ? backendNote.pinned : localNote.pinned,
              tags: backendNote.tags || localNote.tags
            };
            
            await storageService.writeNote(backendNote.id, preservedNote);
            preserved++;
          } else {
            // Update with server version
            await storageService.writeNote(backendNote.id, backendNote);
            updated++;
          }
          
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
      
      console.log(`Merge complete: Added ${added} notes, updated ${updated} notes, preserved ${preserved} decrypted notes`);
      return { success: true, added, updated, preserved };
    } catch (error) {
      console.error('Error merging backend notes:', error);
      return { success: false, error: error.message };
    }
  }

  // Helper method to update a local note with data from server
  async updateLocalNoteFromServer(noteId, noteContent) {
    try {
      if (!noteId || !noteContent) return false;
      
      // Get the current note
      const currentNote = await storageService.readNote(noteId);
      
      // If the note doesn't exist locally, create it
      if (!currentNote) {
        await storageService.writeNote(noteId, noteContent);
        return true;
      }
      
      // IMPORTANT: Don't overwrite a decrypted note with an encrypted one
      // If current note is decrypted (unlocked) but the server version is encrypted,
      // we want to keep our decrypted content
      if (
        // Check for any of our decryption flags
        ((currentNote.persistentDecrypted || !currentNote.encrypted || !currentNote.locked) &&
        (currentNote.wasDecrypted || currentNote.persistentDecrypted)) &&
        // And confirm the server version is encrypted
        noteContent.encrypted && noteContent.locked
      ) {
        console.log(`Preserving local decrypted state for note ${noteId}`);
        
        // Just update metadata, not the content or encryption state
        const preservedNote = {
          ...currentNote,
          // Take some fields from server version
          dateModified: noteContent.dateModified || currentNote.dateModified,
          folderPath: noteContent.folderPath || currentNote.folderPath,
          pinned: noteContent.pinned !== undefined ? noteContent.pinned : currentNote.pinned,
          tags: noteContent.tags || currentNote.tags
        };
        
        await storageService.writeNote(noteId, preservedNote);
        return true;
      }
      
      // Update the existing note with new content from server
      // But preserve any local metadata that shouldn't be overwritten
      const updatedNote = {
        ...currentNote,
        ...noteContent,
        // The server's dateModified should take precedence
        dateModified: noteContent.dateModified || new Date().toISOString()
      };
      
      await storageService.writeNote(noteId, updatedNote);
      return true;
    } catch (error) {
      console.error(`Failed to update note ${noteId} from server:`, error);
      return false;
    }
  }
  
  // Fetch a single note from the server
  async fetchNoteFromServer(noteId) {
    if (!this.currentUserId || !noteId) return false;
    
    try {
      // First, check if we have a local decrypted version
      const localNote = await storageService.readNote(noteId);
      const isLocalDecrypted = localNote && !localNote.encrypted && !localNote.locked;
      
      // Fetch from server
      const response = await fetch(`${API_BASE_URL}/notes/${noteId}/`, {
        method: 'GET',
        credentials: 'include', // Include cookies for session auth
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const backendNote = await response.json();
      
      // Convert to local format
      const serverNote = this.convertFromDjangoFormat(backendNote);
      
      // Check if we need to preserve local decrypted state
      if (
        localNote && 
        // Check for any of our decryption flags
        ((localNote.persistentDecrypted || !localNote.encrypted || !localNote.locked) &&
        (localNote.wasDecrypted || localNote.persistentDecrypted)) &&
        // And confirm the server version is encrypted
        serverNote.encrypted && serverNote.locked
      ) {
        console.log(`fetchNoteFromServer: Preserving local decrypted state for note ${noteId}`);
        
        // Update metadata but keep the decrypted content
        const preservedNote = {
          ...localNote,
          // Update specific fields from server
          dateModified: serverNote.dateModified || localNote.dateModified,
          folderPath: serverNote.folderPath || localNote.folderPath,
          pinned: serverNote.pinned !== undefined ? serverNote.pinned : localNote.pinned,
          tags: serverNote.tags || localNote.tags
        };
        
        // Update local storage with preserved note
        await storageService.writeNote(noteId, preservedNote);
      } else {
        // Use server version (normal case)
        await this.updateLocalNoteFromServer(noteId, serverNote);
      }
      
      // Update sync status
      this.syncStatus.set(noteId, {
        status: 'synced',
        lastSynced: new Date().toISOString(),
        size: new Blob([JSON.stringify(serverNote)]).size
      });
      
      this.notifySubscribers(noteId);
      this.persistSyncData();
      
      return true;
    } catch (error) {
      console.error(`Failed to fetch note ${noteId} from server:`, error);
      return false;
    }
  }
}

export const syncService = new SyncService(); 