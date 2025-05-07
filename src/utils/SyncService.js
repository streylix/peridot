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
    
    // Set up reconnection logic
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // Increased from 5 to 10
    this.reconnectDelay = 3000; // Decreased initial delay for faster recovery
    
    // Status values: 'syncing', 'synced', 'failed', 'not-synced'
    
    // Set up broadcast channel for cross-tab communication
    this.setupBroadcastChannel();
    this.initializeFromLocalStorage();
    this.initializeWebsocket();
    this.setupNoteUpdateListener();
    
    // Fetch backend storage info if authenticated
    if (this.currentUserId) {
      this.fetchBackendStorageInfo();
      // Start periodic polling for folder updates as fallback when WebSockets fail
      this.setupFolderPolling();
    }
    
    // Handle page visibility changes to manage connection state
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Handle window focus/blur to optimize connections
    window.addEventListener('focus', this.handleWindowFocus.bind(this));
    window.addEventListener('blur', this.handleWindowBlur.bind(this));
  }
  
  // Set up broadcast channel for cross-tab sync
  setupBroadcastChannel() {
    try {
      if ('BroadcastChannel' in window) {
        // Close any existing channel
        if (this.broadcastChannel) {
          this.broadcastChannel.close();
        }
        
        // Create a new channel
        this.broadcastChannel = new BroadcastChannel('peridot_sync_channel');
        
        // Setup message handler
        this.broadcastChannel.onmessage = (event) => {
          const { type, data } = event.data;
          
          switch (type) {
            case 'SYNC_STATUS_CHANGED':
              const { noteId, status } = data;
              // Update local sync status
            this.syncStatus.set(noteId, status);
              // Notify subscribers but don't rebroadcast
              this.notifySubscribers(noteId, false);
              break;
              
            case 'SYNC_REQUEST':
              // One tab is requesting sync - check if we have WebSocket connection
              if (this.isWebSocketConnected && this.currentUserId && data.noteId) {
                // We have connection, offer to sync
                this.syncNote(data.noteId)
                  .then(success => {
                    if (success) {
                      // Broadcast that we've synced it
                      this.broadcastSyncUpdate(data.noteId, this.getSyncStatus(data.noteId), true);
          }
                  })
                  .catch(error => console.error(`Error syncing note in response to request: ${data.noteId}`, error));
              }
              break;
              
            case 'CONNECTION_STATUS':
              // Track which tabs have active connections for coordinated reconnection
              if (data.tabId && data.connected) {
                // Another tab is connected, we can potentially back off our reconnect attempts
                if (!this.isWebSocketConnected && data.connected) {
                  console.log('Another tab has WebSocket connection, backing off reconnect attempts');
                  // Increase our delay
                  this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
                }
              }
              break;
          }
        };
        
        // Also broadcast our connection status to other tabs
        if (this.isWebSocketConnected) {
          this.broadcastConnectionStatus();
        }
      } else {
        // Fallback for browsers that don't support BroadcastChannel
        console.log('BroadcastChannel not supported in this browser, using localStorage fallback');
        
        // Check for localStorage events for sync updates
        window.addEventListener('storage', (event) => {
          if (event.key === 'peridot_sync_update') {
            try {
              const data = JSON.parse(event.newValue);
              if (data && data.noteId && data.status) {
                this.syncStatus.set(data.noteId, data.status);
                this.notifySubscribers(data.noteId, false);
              }
            } catch (error) {
              console.error('Failed to process sync update:', error);
            }
          } else if (event.key === 'peridot_sync_request') {
            try {
              const data = JSON.parse(event.newValue);
              if (this.isWebSocketConnected && this.currentUserId && data.noteId) {
                this.syncNote(data.noteId)
                  .catch(error => console.error(`Error syncing note from localStorage request: ${data.noteId}`, error));
              }
            } catch (error) {
              console.error('Failed to process sync request:', error);
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
      
      // If we have an existing connection that's not CLOSED, close it properly first
      if (this.syncSocket) {
        if (this.syncSocket.readyState !== WebSocket.CLOSED) {
          // Remove existing handlers to prevent them from triggering
          this.syncSocket.onclose = null;
          this.syncSocket.onerror = null;
          this.syncSocket.onmessage = null;
          this.syncSocket.onopen = null;
          
          try {
        this.syncSocket.close();
          } catch (e) {
            console.warn('Error closing existing socket:', e);
          }
        }
        
        // Give a small delay before creating a new connection
        setTimeout(() => {
          this._createNewWebSocket(wsUrl);
        }, 500);
      } else {
        this._createNewWebSocket(wsUrl);
      }
    } catch (error) {
      console.error('Failed to initialize sync websocket:', error);
    }
  }
  
  // Setup heartbeat to ensure connection is alive
  setupHeartbeat() {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Check connection every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.syncSocket && this.isWebSocketConnected) {
        // Send ping if connection is open
        if (this.syncSocket.readyState === WebSocket.OPEN) {
          try {
            this.syncSocket.send(JSON.stringify({ 
              type: 'ping',
              timestamp: Date.now()
            }));
            
            // Set a timeout to detect missing pong response
            if (this.pongTimeoutId) {
              clearTimeout(this.pongTimeoutId);
            }
            
            this.pongTimeoutId = setTimeout(() => {
              console.warn('No ping response received, reconnecting WebSocket...');
              this.reconnectWebsocket();
            }, 10000); // Wait 10 seconds for a response
            
          } catch (e) {
            console.warn('Failed to send heartbeat, reconnecting...', e);
            this.reconnectWebsocket();
          }
        } else if (this.syncSocket.readyState !== WebSocket.CONNECTING) {
          // If not connecting but also not open, reconnect
          console.warn('WebSocket not in OPEN state, reconnecting...');
          this.reconnectWebsocket();
        }
      }
    }, 30000);
  }
  
  // Record this tab's connection in localStorage
  recordActiveConnection() {
    const tabId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    this.tabId = tabId;
    
    try {
      // Get existing connections
      const connectionsString = localStorage.getItem('peridot_ws_connections') || '{}';
      const connections = JSON.parse(connectionsString);
      
      // Add/update this connection
      connections[tabId] = {
        timestamp: Date.now(),
        userId: this.currentUserId
      };
      
      // Clean up old connections (older than 1 minute)
      const now = Date.now();
      Object.keys(connections).forEach(id => {
        if (now - connections[id].timestamp > 60000) {
          delete connections[id];
        }
      });
      
      // Save back to localStorage
      localStorage.setItem('peridot_ws_connections', JSON.stringify(connections));
      
      // Set up interval to keep updating our timestamp
      if (this.connectionKeepAliveInterval) {
        clearInterval(this.connectionKeepAliveInterval);
      }
      
      this.connectionKeepAliveInterval = setInterval(() => {
        try {
          const currentConnectionsString = localStorage.getItem('peridot_ws_connections') || '{}';
          const currentConnections = JSON.parse(currentConnectionsString);
          
          // Update our timestamp
          currentConnections[tabId] = {
            timestamp: Date.now(),
            userId: this.currentUserId
          };
          
          localStorage.setItem('peridot_ws_connections', JSON.stringify(currentConnections));
        } catch (e) {
          console.error('Error updating connection keepalive:', e);
        }
      }, 20000);
    } catch (e) {
      console.error('Error recording active connection:', e);
    }
  }
  
  // Remove this tab's connection from localStorage
  removeActiveConnection() {
    if (!this.tabId) return;
    
    try {
      const connectionsString = localStorage.getItem('peridot_ws_connections') || '{}';
      const connections = JSON.parse(connectionsString);
      
      // Remove this connection
      delete connections[this.tabId];
      
      // Save back to localStorage
      localStorage.setItem('peridot_ws_connections', JSON.stringify(connections));
      
      // Clear the keepalive interval
      if (this.connectionKeepAliveInterval) {
        clearInterval(this.connectionKeepAliveInterval);
        this.connectionKeepAliveInterval = null;
      }
    } catch (e) {
      console.error('Error removing active connection:', e);
    }
  }
  
  // Handle visibility change events
  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // Document became visible - ensure connection is active
      if (!this.isWebSocketConnected) {
        console.log('Page became visible, ensuring WebSocket connection...');
        // Add a small delay before reconnecting to avoid rapid cycles
        if (!this._reconnectingAfterVisibilityChange) {
          this._reconnectingAfterVisibilityChange = true;
          setTimeout(() => {
            this.reconnectWebsocket();
            this._reconnectingAfterVisibilityChange = false;
          }, 1000);
        }
      }
      
      // Immediately check for changes when page becomes visible
      console.log('Page became visible, checking for latest changes...');
      this.fetchLatestChanges()
        .catch(e => console.error('Failed to fetch latest changes after visibility change:', e));
    }
  }
  
  // Handle window focus
  handleWindowFocus() {
    console.log('Window gained focus, checking WebSocket connection...');
    if (!this.isWebSocketConnected) {
      this.reconnectWebsocket();
    }
    
    // Also check for latest changes when window gets focus
    this.fetchLatestChanges()
      .catch(e => console.error('Failed to fetch latest changes after window focus:', e));
  }
  
  // Handle window blur - no need to disconnect, just log the event
  handleWindowBlur() {
    console.log('Window lost focus, connection will persist');
  }
  
  // Reconnect WebSocket with exponential backoff
  reconnectWebsocket() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    
    // If we've already tried several times, use longer delays
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      60000 // Cap at 60 seconds max
    );
    
    console.log(`Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    // Clear any existing connection before creating a new one
    if (this.syncSocket && this.syncSocket.readyState !== WebSocket.CLOSED) {
      try {
        this.syncSocket.onclose = null; // Prevent the onclose handler from triggering another reconnect
        this.syncSocket.close();
      } catch (e) {
        console.warn('Error closing existing socket:', e);
      }
    }
    
    setTimeout(() => {
      this.reconnecting = false;
      this.initializeWebsocket();
      this.reconnectAttempts++;
    }, delay);
  }
  
  // WebSocket event handlers
  handleSocketOpen() {
    console.log('WebSocket connection established');
    this.isWebSocketConnected = true;
    this.reconnectAttempts = 0; // Reset attempt counter on successful connection
    
    // Authenticate the WebSocket connection if we have a user ID
    if (this.currentUserId) {
      this.authenticateSocket();
    }
    
    // Trigger a sync after reconnecting
    if (this.reconnectAttempts > 0) {
      setTimeout(() => {
        this.syncAllDirtyNotes()
          .catch(e => console.error('Failed to sync after reconnect:', e));
      }, 1000);
    }
    
    // Reset message throttling when connecting
    this.resetMessageThrottling();
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
      
      // Clear pong timeout on any message
      if (this.pongTimeoutId) {
        clearTimeout(this.pongTimeoutId);
        this.pongTimeoutId = null;
      }
      
      // Simple approach: just handle specific message types without complex throttling
      switch (data.type) {
        case 'connection_established':
          console.log('WebSocket server connection confirmed');
          break;
          
        case 'authenticated':
          console.log('WebSocket authentication successful');
          break;
          
        case 'sync_update':
          // Handle note updates from server, including lock/pin status changes
          if (data.noteId) {
            console.log(`Received sync update for note ${data.noteId} from WebSocket`);
            
            // Check if this is a priority update (like lock/pin status change)
            const isPriority = data.priority === true;
            const isStatusUpdate = data.status_update === true;
            const lockedChanged = data.locked_changed === true;
            const pinnedChanged = data.pinned_changed === true;
            
            if (isPriority) {
              console.log(`Priority update detected for note ${data.noteId}`);
                  
              if (isStatusUpdate) {
                console.log(`Status update: locked=${lockedChanged ? 'changed' : 'unchanged'}, pinned=${pinnedChanged ? 'changed' : 'unchanged'}`);
              }
            }
            
            // If we have the full note content in the message, use it directly
                if (data.noteContent) {
              this.updateLocalNoteFromServer(data.noteId, data.noteContent, {
                isPriority,
                isStatusUpdate,
                lockedChanged,
                pinnedChanged
              })
                .then(success => {
                  if (success) {
                    console.log(`Successfully updated note ${data.noteId} from WebSocket data`);
                } else {
                    console.warn(`Failed to update note ${data.noteId} from WebSocket data`);
                    // Fallback to fetching from server
                    this.fetchNoteFromServer(data.noteId);
                  }
                })
                .catch(error => {
                  console.error(`Error updating note ${data.noteId} from WebSocket:`, error);
                  // Fallback to fetching from server
                  this.fetchNoteFromServer(data.noteId);
                });
            } else {
              // No note content in message, fetch from server
                  this.fetchNoteFromServer(data.noteId)
                    .then(success => {
                      if (success) {
                    console.log(`Successfully refreshed note ${data.noteId} from server`);
                  } else {
                    console.warn(`Failed to refresh note ${data.noteId} from server`);
                }
                })
                .catch(error => {
                  console.error(`Error fetching note ${data.noteId} from server:`, error);
                });
            }
          }
          break;
          
        case 'storage_update':
          // Only update storage info occasionally to avoid constant updates
          if (!this._lastStorageUpdate || Date.now() - this._lastStorageUpdate > 60000) {
          if (data.storage) {
            this.backendStorage = {
              total: data.storage.total_bytes,
              used: data.storage.used_bytes
            };
            this.persistSyncData();
            this.notifySubscribers(null); // Notify all subscribers
              this._lastStorageUpdate = Date.now();
            }
          }
          break;
          
        case 'error':
          console.error('WebSocket error:', data.message);
          break;
          
        case 'ping_response':
          // Handle heartbeat responses
          console.log('Received ping response from server');
          break;
          
        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('Failed to process WebSocket message:', error);
    }
  }
  
  // Update a local note from server data received via WebSocket
  async updateLocalNoteFromServer(noteId, noteContent, options = {}) {
    if (!noteId || !noteContent) return false;
    
    const { isPriority, isStatusUpdate, lockedChanged, pinnedChanged } = options;
    
    try {
      // Convert from server format (camelCase fields)
      const serverNote = this.ensureCamelCase(noteContent);
      
      // Get the current local note to check if it's being edited
      const localNote = await storageService.readNote(noteId);
      
      if (!localNote) {
        // If note doesn't exist locally, just save the server version
        // For folders, ensure visibleTitle is set correctly
        if (serverNote.type === 'folder') {
          // Extract title from content if needed
          if (!serverNote.visibleTitle && serverNote.content) {
            const extractedTitle = serverNote.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1];
            if (extractedTitle) {
              serverNote.visibleTitle = extractedTitle;
            } else {
              serverNote.visibleTitle = 'Untitled Folder';
            }
          }
        }
        
        await storageService.writeNote(noteId, serverNote);
        
        // Dispatch an update event with skipSync flag to prevent loops
        window.dispatchEvent(new CustomEvent('noteUpdate', { 
          detail: { note: {...serverNote, skipSync: true }}
        }));
        
        // Update sync status
        this.syncStatus.set(noteId, {
          status: 'synced',
          lastSynced: new Date().toISOString(),
          size: new Blob([JSON.stringify(serverNote)]).size
        });
        
        this.notifySubscribers(noteId);
        this.persistSyncData();
        return true;
      }
      
      // Special handling for folders to ensure visibleTitle is updated properly
      if (localNote.type === 'folder' && serverNote.content) {
        // Extract the folder name from the content
        const extractedTitle = serverNote.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1];
        if (extractedTitle) {
          serverNote.visibleTitle = extractedTitle;
        } else if (!serverNote.visibleTitle) {
          serverNote.visibleTitle = 'Untitled Folder';
        }
      }
      
      // Special handling for status updates (lock/pin changes)
      if (isStatusUpdate) {
        console.log(`Processing status update for note ${noteId}`);
        
        // Create a merged note that prioritizes lock and pin status from server
        const mergedNote = {
          ...localNote,
          // Update lock/pin status based on what changed
          ...(lockedChanged && { locked: serverNote.locked }),
          ...(pinnedChanged && { pinned: serverNote.pinned }),
          // Take other metadata from server where available
          dateModified: serverNote.dateModified || localNote.dateModified,
          folderPath: serverNote.folderPath || localNote.folderPath,
          tags: serverNote.tags || localNote.tags
        };
        
        // Special handling for encrypted notes when lock status changes
        if (lockedChanged && serverNote.locked && serverNote.encrypted) {
          // If the note was unlocked locally but is now locked from server
          if (localNote.wasDecrypted || !localNote.locked) {
            console.log(`Note ${noteId} was unlocked locally but is now locked from server`);
            // We need to preserve the decrypted content but mark it as locked
            mergedNote.wasDecrypted = true;
            // Don't override content for locked notes, keep the decrypted content
          } else {
            // Note wasn't previously decrypted, use server content
            mergedNote.content = serverNote.content;
            mergedNote.iv = serverNote.iv;
            mergedNote.keyParams = serverNote.keyParams;
          }
        } else if (lockedChanged && !serverNote.locked) {
          // Note was unlocked from another client
          console.log(`Note ${noteId} was unlocked from another client`);
          // Take the unlocked content from server
          mergedNote.content = serverNote.content;
          mergedNote.encrypted = false;
          mergedNote.wasDecrypted = false;
          mergedNote.keyParams = undefined;
          mergedNote.iv = undefined;
        }
        
        // Update local storage with merged note
        await storageService.writeNote(noteId, mergedNote);
        
        // Dispatch an update event with skipSync flag to prevent loops
        window.dispatchEvent(new CustomEvent('noteUpdate', { 
          detail: { note: {...mergedNote, skipSync: true }}
        }));
      }
      // For priority updates (lock/pin changes), create a specialized merged note
      else if (isPriority) {
        console.log(`Processing priority update for note ${noteId} (lock/pin status change)`);
        
        // Create a merged note that prioritizes lock and pin status from server
        const mergedNote = {
          ...localNote,
          // Always take lock/pin status from server
          locked: serverNote.locked !== undefined ? serverNote.locked : localNote.locked,
          pinned: serverNote.pinned !== undefined ? serverNote.pinned : localNote.pinned,
          // Take other metadata from server where available
          dateModified: serverNote.dateModified || localNote.dateModified,
          folderPath: serverNote.folderPath || localNote.folderPath,
          tags: serverNote.tags || localNote.tags
        };
        
        // Special handling for locked notes - maintain decrypted state if possible
        if (localNote.wasDecrypted && serverNote.locked && serverNote.encrypted) {
          console.log(`Preserving local decrypted state while updating lock status`);
          // Don't override content for locked notes, keep the decrypted content if we have it
        } else if (serverNote.content) {
          // Take server content if it's available and we're not preserving decrypted content
          mergedNote.content = serverNote.content;
        }
        
        // Update local storage with merged note
        await storageService.writeNote(noteId, mergedNote);
        
        // Dispatch an update event with skipSync flag to prevent loops
        window.dispatchEvent(new CustomEvent('noteUpdate', { 
          detail: { note: {...mergedNote, skipSync: true }}
        }));
      }
      // Special handling for encrypted notes - preserve local decrypted state if available
      else if (localNote.wasDecrypted && serverNote.encrypted && serverNote.locked) {
        console.log(`Preserving local decrypted state for note ${noteId} while updating lock status`);
        
        // Create a merged note that keeps local content but updates metadata
        const mergedNote = {
          ...localNote,
          dateModified: serverNote.dateModified || localNote.dateModified,
          folderPath: serverNote.folderPath || localNote.folderPath,
          pinned: serverNote.pinned !== undefined ? serverNote.pinned : localNote.pinned,
          locked: serverNote.locked, // Ensure we update the lock status
          tags: serverNote.tags || localNote.tags
        };
        
        // Update local storage with preserved note
        await storageService.writeNote(noteId, mergedNote);
        
        // Dispatch an update event with skipSync flag to prevent loops
        window.dispatchEvent(new CustomEvent('noteUpdate', { 
          detail: { note: {...mergedNote, skipSync: true }}
        }));
      } else {
        // Regular update with server content
        await storageService.writeNote(noteId, serverNote);
        
        // Dispatch an update event with skipSync flag to prevent loops
        window.dispatchEvent(new CustomEvent('noteUpdate', { 
          detail: { note: {...serverNote, skipSync: true }}
        }));
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
      console.error(`Error updating note ${noteId} from server data:`, error);
      return false;
    }
  }
  
  handleSocketClose(event) {
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    this.isWebSocketConnected = false;
    
    // Don't reconnect if this was a normal closure
    if (event.code === 1000) {
      console.log('Normal WebSocket closure, not reconnecting');
      return;
    }
    
    // Don't reconnect immediately if not in active tab
    if (document.visibilityState !== 'visible') {
      console.log('Page is not visible, delaying reconnect until focus');
      return;
    }
    
    // Attempt to reconnect if we haven't hit the limit
    if (this.reconnectAttempts < this.maxReconnectAttempts && !this.reconnecting) {
      // Add a small delay before reconnecting to avoid rapid cycles
      setTimeout(() => {
        this.reconnectWebsocket();
      }, 1000);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max reconnection attempts reached, giving up');
      // Reset attempts so we can try again if the user interacts with the page
      setTimeout(() => {
        this.reconnectAttempts = 0;
      }, 60000); // Wait a minute before allowing reconnects again
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
  
  // Set up a listener for note updates to trigger sync
  setupNoteUpdateListener() {
    console.log('Setting up note update listener for automatic syncing');
    
    // Listen for DOM events from components
    window.addEventListener('noteUpdate', this.handleNoteUpdate.bind(this));
    
    // Listen for broadcast channel events from other tabs
    window.addEventListener('storage', event => {
      if (event.key === 'note_cross_update') {
        try {
          const data = JSON.parse(event.newValue);
          if (data && data.note && data.timestamp) {
            this.handleNoteUpdate({ detail: { note: data.note }});
          }
        } catch (error) {
          console.error('Failed to parse cross-tab note update:', error);
        }
      }
    });
    
    // Subscribe to noteUpdateService for more reliable event capture
    noteUpdateService.subscribe(note => {
      if (!note) return;
      this.handleNoteUpdate({ detail: { note }});
    });
  }
  
  // Handler for note update events
  handleNoteUpdate(event) {
    const note = event.detail?.note;
    if (!note || !note.id) return;
    
    // Skip temp notes and notes that shouldn't be synced
    if (note.temporary || note.skipSync) return;
    
    // Don't try to sync if we don't have a user ID
    if (!this.currentUserId) return;
    
    // Simple debounce to prevent rapid-fire syncs of the same note
    if (this.noteSyncTimers && this.noteSyncTimers[note.id]) {
      clearTimeout(this.noteSyncTimers[note.id]);
    }
    
    if (!this.noteSyncTimers) {
      this.noteSyncTimers = {};
    }
    
    // Queue up the sync with a short delay
    this.noteSyncTimers[note.id] = setTimeout(() => {
      // Mark as syncing (for UI feedback)
      this.syncStatus.set(note.id, {
        status: 'syncing',
        lastSynced: null
      });
      
      // Notify subscribers about the status change
      this.notifySubscribers(note.id);
      
      // Send the note to the server
      this.syncNote(note.id)
        .catch(error => console.error(`Failed to sync note ${note.id}:`, error))
        .finally(() => {
          delete this.noteSyncTimers[note.id];
        });
    }, 1000); // 1 second debounce
  }
  
  // Simply fetch a note from the server
  async fetchNoteFromServer(noteId) {
    if (!this.currentUserId || !noteId) return false;
    
    try {
      // Get current note to check for local changes
      const localNote = await storageService.readNote(noteId);
      
      // Skip if we're currently editing this note
      if (localNote && localNote.isCurrentlyEditing) {
        console.log(`Note ${noteId} is currently being edited, skipping server fetch`);
        return true;
      }
      
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
      
      // Special handling for encrypted notes
      if (localNote && localNote.wasDecrypted && serverNote.encrypted && serverNote.locked) {
        console.log(`Preserving local decrypted state for note ${noteId}`);
    
        // Create a merged note that keeps local content but updates metadata
        const mergedNote = {
          ...localNote,
          dateModified: serverNote.dateModified || localNote.dateModified,
          folderPath: serverNote.folderPath || localNote.folderPath,
          pinned: serverNote.pinned !== undefined ? serverNote.pinned : localNote.pinned,
          tags: serverNote.tags || localNote.tags
        };
        
        // Update local storage with preserved note
        await storageService.writeNote(noteId, mergedNote);
        
        // Dispatch an update event with skipSync flag to prevent loops
        const eventNote = {...mergedNote, skipSync: true};
        window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: eventNote }}));
      } else {
        // Regular update with server content
        await storageService.writeNote(noteId, serverNote);
        
        // Dispatch an update event with skipSync flag to prevent loops
        const eventNote = {...serverNote, skipSync: true};
        window.dispatchEvent(new CustomEvent('noteUpdate', { detail: { note: eventNote }}));
      }
      
      // Update sync status
      this.syncStatus.set(noteId, {
        status: 'synced',
        lastSynced: new Date().toISOString()
      });
      
      this.notifySubscribers(noteId);
      this.persistSyncData();
      
      return true;
    } catch (error) {
      console.error(`Failed to fetch note ${noteId} from server:`, error);
      
      // Update sync status to reflect failure
      this.syncStatus.set(noteId, {
        status: 'failed',
        lastSynced: null,
        error: error.message
      });
      
      this.notifySubscribers(noteId);
      this.persistSyncData();
      
      return false;
    }
  }
  
  // Start syncing a note
  async syncNote(noteId) {
    try {
      // Check if we're authenticated
      if (!this.currentUserId) {
        throw new Error('Not authenticated');
      }
      
      // Update status to syncing
      const syncingStatus = {
        status: 'syncing',
        lastSynced: null
      };
      this.syncStatus.set(noteId, syncingStatus);
      
      // Notify subscribers immediately about the syncing state
      this.notifySubscribers(noteId);
      
      // Get the note
      const note = await storageService.readNote(noteId);
      if (!note) {
        throw new Error('Note not found');
      }
      
      // Check if this is just a cursor position update without content changes
      // Enhanced check to determine if there are any meaningful changes
      let hasContentChanges = false;
      
      // For regular notes, check content changes
      if (note.type !== 'folder' && note.lastSyncedContent && note.content !== note.lastSyncedContent) {
        hasContentChanges = true;
      }
      
      // For folders, check both content and visibleTitle changes
      if (note.type === 'folder') {
        if (note.lastSyncedContent && note.content !== note.lastSyncedContent) {
          hasContentChanges = true;
        }
        if (note.lastSyncedVisibleTitle && note.visibleTitle !== note.lastSyncedVisibleTitle) {
          hasContentChanges = true;
        }
      }
      
      // Always consider status changes (pinned, locked) as meaningful
      if (note.lastSyncedPinned !== undefined && note.pinned !== note.lastSyncedPinned) {
        hasContentChanges = true;
      }
      if (note.lastSyncedLocked !== undefined && note.locked !== note.lastSyncedLocked) {
        hasContentChanges = true;
      }
      
      // Skip sync if there are no meaningful changes
      if (!hasContentChanges && note.lastSyncedContent) {
        console.log(`Note ${noteId} has no meaningful changes, skipping sync`);
        
        // Just update status to synced without sending to server
        const syncedStatus = {
          status: 'synced',
          lastSynced: new Date().toISOString()
        };
        this.syncStatus.set(noteId, syncedStatus);
        this.notifySubscribers(noteId);
        this.persistSyncData();
        return true;
      }
      
      // Check if this note exists on the server and get its last modification time
      try {
        const response = await fetch(`${API_BASE_URL}/notes/${noteId}/`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const serverNote = await response.json();
          
          // Compare timestamps to prevent overwriting newer data with older data
          if (serverNote.date_modified) {
            const serverModTime = new Date(serverNote.date_modified).getTime();
            const localModTime = new Date(note.dateModified).getTime();
            
            // More strict comparison - only override if server is definitely newer
            // Allow for 3 second margin to account for clock differences
            const timeDifference = serverModTime - localModTime;
            const toleranceMs = 3000; // 3 second tolerance
            
            if (timeDifference > toleranceMs) {
              console.log(`Server version of note ${noteId} is newer by ${timeDifference}ms, aborting sync`);
              console.log(`Server: ${new Date(serverModTime).toISOString()}, Local: ${new Date(localModTime).toISOString()}`);
              
              // Update local note with server data
              const convertedNote = this.convertFromDjangoFormat(serverNote);
              await storageService.writeNote(noteId, {
                ...note,
                ...convertedNote,
                // Keep local cursor position and any decrypted state
                caretPosition: note.caretPosition,
                wasDecrypted: note.wasDecrypted
              });
              
              // Update sync status
              const syncedStatus = {
                status: 'synced',
                lastSynced: new Date().toISOString()
              };
              this.syncStatus.set(noteId, syncedStatus);
              this.notifySubscribers(noteId);
              this.persistSyncData();
              
              // Notify UI of the update
              window.dispatchEvent(new CustomEvent('noteUpdate', {
                detail: { note: { ...convertedNote, skipSync: true } }
              }));
              
              return true;
            }
            // If server and client times are within tolerance, compare content
            else if (Math.abs(timeDifference) <= toleranceMs) {
              // If server note has exactly the same content, skip the update
              if (serverNote.content === note.content) {
                console.log(`Note ${noteId} content unchanged on server, skipping sync`);
                
                // Just update status to synced without sending to server
                const syncedStatus = {
                  status: 'synced',
                  lastSynced: new Date().toISOString()
                };
                this.syncStatus.set(noteId, syncedStatus);
                this.notifySubscribers(noteId);
                this.persistSyncData();
                return true;
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error checking server version of note ${noteId}:`, error);
        // Continue with sync even if check fails
      }
      
      // Mark this note as being edited locally to prevent conflicts
      note.isCurrentlyEditing = true;
      await storageService.writeNote(noteId, note);
      
      // Special handling for encrypted notes
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
      const syncedStatus = {
        status: 'synced',
        lastSynced: new Date().toISOString()
      };
      this.syncStatus.set(noteId, syncedStatus);
      
      // Notify subscribers
      this.notifySubscribers(noteId);
      
      // Persist sync data
      this.persistSyncData();
      
      // After successful sync, update the note with sync timestamp and remove editing flag
      try {
        const updatedNote = await storageService.readNote(noteId);
        if (updatedNote) {
          // Store data to prevent unnecessary syncing for caret position changes
          updatedNote.lastSyncedContent = updatedNote.content;
          updatedNote.lastSyncedVisibleTitle = updatedNote.visibleTitle;
          updatedNote.lastSyncedPinned = updatedNote.pinned;
          updatedNote.lastSyncedLocked = updatedNote.locked;
          updatedNote.serverModifiedAt = new Date().toISOString();
          updatedNote.lastSyncedModified = updatedNote.dateModified;
          updatedNote.isCurrentlyEditing = false;
          await storageService.writeNote(noteId, updatedNote);
        }
      } catch (e) {
        console.warn(`Failed to update note with server timestamp: ${e.message}`);
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to sync note ${noteId}:`, error);
      
      // Update status to failed
      const failedStatus = {
        status: 'failed',
        lastSynced: null,
        error: error.message
      };
      this.syncStatus.set(noteId, failedStatus);
      
      // Clear the editing flag even if sync failed
      try {
        const note = await storageService.readNote(noteId);
        if (note) {
          note.isCurrentlyEditing = false;
          await storageService.writeNote(noteId, note);
        }
      } catch (e) {
        console.warn(`Failed to clear editing flag: ${e.message}`);
      }
      
      // Notify subscribers
      this.notifySubscribers(noteId);
      
      // Persist sync data
      this.persistSyncData();
      
      return false;
    }
  }
  
  // Track sync attempt counts to prevent excessive parallel syncs
  trackSyncAttempt(noteId) {
    if (!this._activeSyncAttempts) {
      this._activeSyncAttempts = {};
      this._recentSyncs = {};
    }
    
    this._activeSyncAttempts[noteId] = (this._activeSyncAttempts[noteId] || 0) + 1;
    
    // Also mark when sync was last attempted for this note
    this._recentSyncs[noteId] = Date.now();
    
    console.log(`Active sync attempts for ${noteId}: ${this._activeSyncAttempts[noteId]}`);
  }
  
  // Release sync attempt counter when sync completes
  releaseSyncAttempt(noteId) {
    if (!this._activeSyncAttempts) {
      this._activeSyncAttempts = {};
      return;
    }
    
    if (this._activeSyncAttempts[noteId]) {
      this._activeSyncAttempts[noteId]--;
      console.log(`Released sync attempt for ${noteId}, remaining: ${this._activeSyncAttempts[noteId]}`);
    }
  }
  
  // Check if a note was recently synced or has too many active syncs
  isRecentlySynced(noteId) {
    if (!this._recentSyncs || !this._activeSyncAttempts) {
      this._recentSyncs = {};
      this._activeSyncAttempts = {};
      return false;
    }
    
    const lastSync = this._recentSyncs[noteId] || 0;
    const activeAttempts = this._activeSyncAttempts[noteId] || 0;
    const now = Date.now();
    
    // Consider a note "recently synced" if:
    // 1. It was synced within the last 10 seconds, OR
    // 2. It has more than 2 concurrent sync attempts in progress
    return (now - lastSync < 10000) || (activeAttempts > 2);
  }
  
  // Helper method to determine if an update is "minor" and should be skipped
  isMinorUpdate(note) {
    // If the note has just been created, don't consider it minor
    if (note.dateCreated && new Date(note.dateCreated).getTime() > Date.now() - 30000) {
      return false;
    }
    
    // Check if the update is only for cursor position or other non-content fields
    const significantFields = [
      'content', 'locked', 'encrypted', 'pinned', 'tags', 
      'parentFolderId', 'folderPath', 'type', 'isOpen'
    ];
    
    // Last modified should have changed for any significant update
    const hasModifiedChanged = note.dateModified && 
      (!note.lastSyncedModified || note.dateModified !== note.lastSyncedModified);
    
    if (hasModifiedChanged) {
      // If we know when this was last modified, compare with last sync time
      if (note.lastSyncedModified) {
        // Check if it's a very recent change (within 2 seconds)
        const modifiedTime = new Date(note.dateModified).getTime();
        const lastSyncedTime = new Date(note.lastSyncedModified).getTime();
        
        if (modifiedTime - lastSyncedTime < 2000) {
          // Very recent change might be from our own sync, skip it
          return true;
      }
      }
      
      return false;
    }
    
    return true;
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
  notifySubscribers(noteId, isResponse = true) {
    this.subscribers.forEach(callback => callback(noteId, this.getSyncStatus(noteId)));
    
    // Also emit a DOM event for direct UI updates
    if (noteId) {
      const status = this.getSyncStatus(noteId);
      window.dispatchEvent(new CustomEvent('syncStatusUpdate', {
        detail: { noteId, status }
      }));
    }
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
  
  // Trigger sync if note is dirty, with cross-tab coordination
  async syncIfDirty(noteId) {
    try {
      // Check if this note is dirty
      const status = this.getSyncStatus(noteId);
      if (status.status !== 'not-synced') {
        return true; // Already synced or in progress
      }
      
      // If we have a connection, sync directly
      if (this.isWebSocketConnected && this.currentUserId) {
      return await this.syncNote(noteId);
    }
    
      // Otherwise, request sync from any connected tab
      this.requestSync(noteId);
      
      // Mark as syncing temporarily
      this.syncStatus.set(noteId, { 
        status: 'syncing',
        lastSynced: Date.now()
      });
      this.notifySubscribers(noteId);
      
      // After a timeout, check if it got synced
      return new Promise(resolve => {
        setTimeout(async () => {
          const currentStatus = this.getSyncStatus(noteId);
          if (currentStatus.status === 'synced') {
            resolve(true);
          } else if (this.isWebSocketConnected) {
            // We got a connection, try again
            const result = await this.syncNote(noteId);
            resolve(result);
          } else {
            // Reset status to not-synced for future attempts
            this.syncStatus.set(noteId, {
              status: 'not-synced',
              lastSynced: null
            });
            this.notifySubscribers(noteId);
            resolve(false);
          }
        }, 5000); // Wait 5 seconds for another tab to sync
      });
    } catch (error) {
      console.error(`Failed to sync dirty note ${noteId}:`, error);
      return false;
    }
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
    // Create Django format note, but exclude isOpen from sync
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
      tags: note.tags || [],
      type: note.type || 'note',
      parent_folder_id: note.parentFolderId || null
      // Deliberately removing is_open to prevent sync
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
      tags: note.tags || [],
      type: note.type || 'note',
      parentFolderId: note.parent_folder_id || null
      // Deliberately omitting isOpen to use local state only
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
  
  // Broadcast connection status to other tabs
  broadcastConnectionStatus() {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'CONNECTION_STATUS',
          data: {
            tabId: this.tabId,
            connected: this.isWebSocketConnected
          }
        });
      } catch (e) {
        console.error('Failed to broadcast connection status:', e);
      }
    } else {
      // Fallback to localStorage
      try {
        localStorage.setItem('peridot_connection_status', JSON.stringify({
          tabId: this.tabId,
          connected: this.isWebSocketConnected,
          timestamp: Date.now()
        }));
        setTimeout(() => localStorage.removeItem('peridot_connection_status'), 100);
      } catch (e) {
        console.error('Failed to use localStorage for connection status:', e);
      }
    }
  }
  
  // Broadcast sync update to other tabs
  broadcastSyncUpdate(noteId, status, isResponse = false) {
    try {
      if (!noteId) return;
      
      // Skip broadcast for responses to sync requests to avoid loops
      if (isResponse && !this.broadcastChannel) return;
      
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'SYNC_STATUS_CHANGED',
          data: { noteId, status, isResponse }
        });
      } else {
        // Fallback to localStorage
        localStorage.setItem('peridot_sync_update', JSON.stringify({
            noteId,
          status,
          timestamp: Date.now(),
          isResponse
        }));
        setTimeout(() => localStorage.removeItem('peridot_sync_update'), 100);
      }
      
      // Also fire a DOM event for components that are listening
      const event = new CustomEvent('syncStatusUpdate', {
        detail: { noteId, status }
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to broadcast sync update:', error);
    }
  }
  
  // Request sync from any tab that's connected
  requestSync(noteId) {
    try {
      if (!noteId) return;
      
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'SYNC_REQUEST',
          data: { noteId }
        });
      } else {
        // Fallback to localStorage
        localStorage.setItem('peridot_sync_request', JSON.stringify({
          noteId, 
          timestamp: Date.now()
        }));
        setTimeout(() => localStorage.removeItem('peridot_sync_request'), 100);
      }
    } catch (error) {
      console.error('Failed to request sync:', error);
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
  
  // Sync all dirty notes - adds a method to sync notes that have been modified
  async syncAllDirtyNotes() {
    if (!this.currentUserId || !this.isWebSocketConnected) {
      return false;
      }
      
    try {
      // Get all notes to check which ones need syncing
      const notes = await storageService.getAllNotes();
      
      // Build list of notes that need syncing
      const syncPromises = [];
      
      for (const note of notes) {
        const syncStatus = this.getSyncStatus(note.id);
        if (
          syncStatus.status === 'not-synced' || 
          (note.serverModifiedAt && note.dateModified > note.serverModifiedAt)
        ) {
          syncPromises.push(this.syncNote(note.id));
      }
      }
      
      if (syncPromises.length > 0) {
        console.log(`Syncing ${syncPromises.length} dirty notes...`);
        await Promise.all(syncPromises);
        return true;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to sync dirty notes:', error);
      return false;
    }
  }

  // Clean up resources when the service is no longer needed
  cleanup() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
    
    if (this.syncSocket) {
      this.syncSocket.close();
    }
    
    // Remove heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Remove folder polling interval
    if (this.folderPollingInterval) {
      clearInterval(this.folderPollingInterval);
      this.folderPollingInterval = null;
    }
    
    // Remove connection tracking
    this.removeActiveConnection();
          
    // Remove event listeners
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('blur', this.handleWindowBlur);
    
    // Clear any keepalive interval
    if (this.connectionKeepAliveInterval) {
      clearInterval(this.connectionKeepAliveInterval);
      this.connectionKeepAliveInterval = null;
    }
  }

  // Helper to ensure camelCase fields from snake_case backend response
  ensureCamelCase(data) {
    if (!data) return data;
    
    const result = { ...data };
    
    // Convert common snake_case fields to camelCase
    if (data.date_created) result.dateCreated = data.date_created;
    if (data.date_modified) result.dateModified = data.date_modified;
    if (data.folder_path) result.folderPath = data.folder_path;
    if (data.visible_title) result.visibleTitle = data.visible_title;
    if (data.key_params) result.keyParams = data.key_params;
    
    return result;
  }

  // Initialize message throttling
  resetMessageThrottling() {
    this._messageThrottles = {};
    this._serverErrorCounts = {};
    this._lastStorageUpdate = 0;
      }
      
  // Check if a message should be throttled
  shouldThrottleMessage(type, noteId) {
    if (!this._messageThrottles) {
      this.resetMessageThrottling();
    }
    
    const now = Date.now();
    const key = noteId ? `${type}_${noteId}` : type;
    
    // Special handling for storage_update type - limit to one per minute
    if (type === 'storage_update') {
      if (now - this._lastStorageUpdate < 60000) {
        console.log('Throttling storage update message - too frequent');
        return true;
      }
      this._lastStorageUpdate = now;
      return false;
    }
    
    // Get last time this message type was processed
    const lastProcessed = this._messageThrottles[key] || 0;
    
    // Store error counts for server responses
    if (type === 'sync_update' && noteId) {
      // Count this message
      this._serverErrorCounts[noteId] = (this._serverErrorCounts[noteId] || 0) + 1;
      
      // If this note has too many updates, ignore it completely for a longer time
      const errorCount = this._serverErrorCounts[noteId];
      if (errorCount > 10) {
        const backoffTime = Math.min(60000 * Math.pow(2, Math.floor(errorCount / 10) - 1), 3600000);
        if (now - lastProcessed < backoffTime) {
          console.log(`Complete server-side throttling for note ${noteId} - excessive messages (${errorCount})`);
          this._messageThrottles[key] = now; // Update timestamp to keep throttling
      return true;
        }
        
        // Reset counter after backoff period
        if (errorCount > 20) {
          this._serverErrorCounts[noteId] = 0;
          console.log(`Resetting throttle counter for note ${noteId} after extended backoff`);
        }
      }
    }
    
    // Determine throttle time based on message type
    let throttleTime = 5000; // Default 5 seconds between messages
    
    if (type === 'sync_update') {
      // Increase throttle time based on number of recent messages
      const msgCount = this._serverErrorCounts[noteId] || 0;
      if (msgCount > 5) {
        throttleTime = 30000; // 30 seconds if many messages
      } else if (msgCount > 2) {
        throttleTime = 15000; // 15 seconds if several messages
      }
    }
    
    // Check if we should throttle
    if (now - lastProcessed < throttleTime) {
      console.log(`Throttling ${type} message for ${noteId || 'system'} - too frequent`);
      return true;
    }
    
    // Update last processed time
    this._messageThrottles[key] = now;
    return false;
  }
  
  // Remove a note from backend sync
  async removeFromSync(noteId) {
    try {
      // Check if we're authenticated
      if (!this.currentUserId) {
        throw new Error('Not authenticated');
      }
      
      const currentStatus = this.getSyncStatus(noteId);
      
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
        
        // Skip notes that are broken or marked to skip sync
        if (note.syncDisabled || note.skipSync) {
          console.log(`Skipping note ${note.id} - sync disabled`);
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

  // Helper to create a new WebSocket with proper handlers
  _createNewWebSocket(wsUrl) {
    try {
      this.syncSocket = new WebSocket(wsUrl);
      
      // Set up connection handlers
      this.syncSocket.onopen = this.handleSocketOpen.bind(this);
      this.syncSocket.onmessage = this.handleSocketMessage.bind(this);
      this.syncSocket.onclose = this.handleSocketClose.bind(this);
      this.syncSocket.onerror = this.handleSocketError.bind(this);
      
      // Track connection state
      this.isWebSocketConnected = false;
      
      // Set up heartbeat to detect disconnects that the browser doesn't catch
      this.setupHeartbeat();
      
      // Record this tab's connection in localStorage for persistence tracking
      this.recordActiveConnection();
    } catch (e) {
      console.error('Error creating WebSocket:', e);
      
      // Schedule a retry
      if (!this.reconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectWebsocket();
        }, 5000);
      }
    }
  }

  // Get all notes directly from the backend and update sync status
  async getNotesFromBackend() {
    if (!this.currentUserId) {
      console.log('Cannot get notes from backend: Not authenticated');
      return [];
    }
    
    try {
      const { success, notes } = await this.fetchNotesFromBackend();
      
      if (!success || !notes) {
        console.error('Failed to get notes from backend');
        return [];
      }
      
      // Return the notes directly in the format expected by SyncSection
      return notes;
    } catch (error) {
      console.error('Failed to get notes from backend:', error);
      return [];
    }
  }

  // Fetch Notes from Backend 
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
      // Notify subscribers about the sync status changes
      this.notifySubscribers();
      
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
            localNote && 
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
              locked: backendNote.locked, // Ensure we update the lock status
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

  // Set up periodic polling for folder updates when WebSockets aren't working
  setupFolderPolling() {
    // Clear any existing polling interval
    if (this.folderPollingInterval) {
      clearInterval(this.folderPollingInterval);
    }
    
    // Poll every 10 seconds
    this.folderPollingInterval = setInterval(async () => {
      // Skip if WebSocket is connected
      if (this.isWebSocketConnected) return;
      
      try {
        // Get all notes from the server
        const { success, notes } = await this.fetchNotesFromBackend();
        
        if (success && notes && notes.length > 0) {
          // Filter for folders only
          const folders = notes.filter(note => note.type === 'folder');
          
          if (folders.length > 0) {
            console.log(`Polling found ${folders.length} folders, updating local state`);
            
            // Update local state for each folder
            for (const folder of folders) {
              const localFolder = await storageService.readNote(folder.id);
              
              // Skip if local folder doesn't exist or is newer
              if (!localFolder) continue;
              if (new Date(localFolder.dateModified) > new Date(folder.dateModified)) continue;
              
              // Check if visibleTitle or content has changed
              if (localFolder.visibleTitle !== folder.visibleTitle || 
                  localFolder.content !== folder.content) {
                console.log(`Updating folder ${folder.id} from polling`);
                
                // Update the local folder
                await storageService.writeNote(folder.id, folder);
                
                // Dispatch update event with skipSync flag to prevent loops
                window.dispatchEvent(new CustomEvent('noteUpdate', {
                  detail: { note: {...folder, skipSync: true }}
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in folder polling:', error);
      }
    }, 10000); // Poll every 10 seconds
  }

  // New method to fetch the latest changes from the server
  async fetchLatestChanges() {
    if (!this.currentUserId) return false;
    
    try {
      console.log('Fetching latest changes from server...');
      
      // Fetch notes from the server
      const { success, notes } = await this.fetchNotesFromBackend();
      
      if (success && notes && notes.length > 0) {
        console.log(`Fetched ${notes.length} notes, checking for updates...`);
        
        let updatedCount = 0;
        
        // Compare each server note with local version
        for (const serverNote of notes) {
          try {
            const localNote = await storageService.readNote(serverNote.id);
            
            // Skip if note doesn't exist locally
            if (!localNote) continue;
            
            // Compare timestamps - server version newer?
            const serverModTime = new Date(serverNote.dateModified).getTime();
            const localModTime = new Date(localNote.dateModified).getTime();
            
            // If server is newer, update the local version
            if (serverModTime > localModTime) {
              console.log(`Server has newer version of note ${serverNote.id}, updating local copy`);
              
              // Preserve caretPosition and other local state
              const mergedNote = {
                ...serverNote,
                caretPosition: localNote.caretPosition,
                isCurrentlyEditing: localNote.isCurrentlyEditing
              };
              
              // Special handling for encrypted notes we've already decrypted
              if (localNote.wasDecrypted && serverNote.encrypted && serverNote.locked) {
                console.log(`Preserving decrypted state for note ${serverNote.id}`);
                mergedNote.wasDecrypted = true;
                mergedNote.content = localNote.content;
              }
              
              // Update local storage
              await storageService.writeNote(serverNote.id, mergedNote);
              
              // Notify UI about the update
              window.dispatchEvent(new CustomEvent('noteUpdate', {
                detail: { note: {...mergedNote, skipSync: true }}
              }));
              
              updatedCount++;
            } 
            // Even if timestamps match, check for folder relationships that may have changed
            else if (
              // Different parent folder
              localNote.parentFolderId !== serverNote.parentFolderId ||
              // Folder title changed
              (serverNote.type === 'folder' && serverNote.visibleTitle !== localNote.visibleTitle) ||
              // Folder content changed
              (serverNote.type === 'folder' && serverNote.content !== localNote.content)
            ) {
              console.log(`Note ${serverNote.id} folder relationship or folder metadata changed, updating local copy`);
              
              // Create merged note with updated folder relationship and preserved local state
              const mergedNote = {
                ...localNote,
                parentFolderId: serverNote.parentFolderId,
                visibleTitle: serverNote.type === 'folder' ? serverNote.visibleTitle : localNote.visibleTitle,
                content: serverNote.type === 'folder' ? serverNote.content : localNote.content
              };
              
              // Update local storage
              await storageService.writeNote(serverNote.id, mergedNote);
              
              // Trigger appropriate UI event
              if (serverNote.type === 'folder') {
                window.dispatchEvent(new CustomEvent('foldersUpdated', {
                  detail: { folders: [mergedNote] }
                }));
              } else {
                window.dispatchEvent(new CustomEvent('noteUpdate', {
                  detail: { note: {...mergedNote, skipSync: true }}
                }));
              }
              
              updatedCount++;
            }
          } catch (error) {
            console.error(`Error checking note ${serverNote.id} for updates:`, error);
          }
        }
        
        if (updatedCount > 0) {
          console.log(`Updated ${updatedCount} local notes from server`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Failed to fetch latest changes:', error);
      return false;
    }
  }
}

export const syncService = new SyncService(); 