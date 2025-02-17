// StorageService.js

class StorageService {
  constructor() {
    this.root = null;
    this.initialized = false;
    this.pendingSaves = new Map();
    this.DEBOUNCE_MS = 1;
    this.db = null;
    this.storageType = null;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      // Try OPFS first
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        this.root = await navigator.storage.getDirectory();
        await this.ensureNotesDirectory();
        await this.ensurePasswordsDirectory();
        this.storageType = 'opfs';
        console.log('Using OPFS storage');
      } else {
        // Try IndexedDB
        try {
          await this.initIndexedDB();
          this.storageType = 'indexeddb';
          console.log('Using IndexedDB storage');
        } catch (error) {
          // Fallback to localStorage
          console.log('Using localStorage');
          this.storageType = 'localstorage';
        }
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      throw error;
    }
  }

  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('peridot_notes', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('passwords')) {
          db.createObjectStore('passwords', { keyPath: 'noteId' });
        }
      };
    });
  }

  async writeNote(noteId, noteData) {
    await this.init();

    // Clear any pending save
    if (this.pendingSaves.has(noteId)) {
      clearTimeout(this.pendingSaves.get(noteId));
    }

    // Create a new debounced save
    const savePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        try {
          switch (this.storageType) {
            case 'opfs':
              const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
              const fileHandle = await notesDir.getFileHandle(`${noteId}.json`, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(JSON.stringify(noteData));
              await writable.close();
              break;

            case 'indexeddb':
              const tx = this.db.transaction('notes', 'readwrite');
              const store = tx.objectStore('notes');
              await store.put(noteData);
              break;

            case 'localstorage':
              try {
                localStorage.setItem(`note_${noteId}`, JSON.stringify(noteData));
              } catch (e) {
                if (e.name === 'QuotaExceededError') {
                  throw new Error('Storage is full. Please delete some notes.');
                }
                throw e;
              }
              break;
          }
          
          this.pendingSaves.delete(noteId);
          resolve();
        } catch (error) {
          console.error(`Failed to write note ${noteId}:`, error);
          this.pendingSaves.delete(noteId);
          reject(error);
        }
      }, this.DEBOUNCE_MS);

      this.pendingSaves.set(noteId, timeoutId);
    });

    return savePromise;
  }

  async readNote(noteId) {
    await this.init();

    try {
      if (this.pendingSaves.has(noteId)) {
        await new Promise(resolve => {
          const existingTimeout = this.pendingSaves.get(noteId);
          clearTimeout(existingTimeout);
          this.pendingSaves.set(noteId, setTimeout(resolve, 0));
        });
      }

      switch (this.storageType) {
        case 'opfs':
          const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
          const fileHandle = await notesDir.getFileHandle(`${noteId}.json`);
          const file = await fileHandle.getFile();
          const contents = await file.text();
          return JSON.parse(contents);

        case 'indexeddb':
          const tx = this.db.transaction('notes', 'readonly');
          const store = tx.objectStore('notes');
          return await store.get(noteId);

        case 'localstorage':
          const noteStr = localStorage.getItem(`note_${noteId}`);
          return noteStr ? JSON.parse(noteStr) : null;
      }
    } catch (error) {
      console.error(`Failed to read note ${noteId}:`, error);
      throw error;
    }
  }

  async getAllNotes() {
    await this.init();

    try {
      if (this.pendingSaves.size > 0) {
        await Promise.all(
          Array.from(this.pendingSaves.values()).map(
            timeoutId => new Promise(resolve => {
              clearTimeout(timeoutId);
              setTimeout(resolve, 0);
            })
          )
        );
      }

      switch (this.storageType) {
        case 'opfs':
          const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
          const notes = [];
          for await (const [name, handle] of notesDir.entries()) {
            if (name.endsWith('.json')) {
              const file = await handle.getFile();
              const contents = await file.text();
              notes.push(JSON.parse(contents));
            }
          }
          return notes;

        case 'indexeddb':
          const tx = this.db.transaction('notes', 'readonly');
          const store = tx.objectStore('notes');
          return await store.getAll();

        case 'localstorage':
          const localNotes = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('note_')) {
              const note = JSON.parse(localStorage.getItem(key));
              localNotes.push(note);
            }
          }
          return localNotes;
      }
    } catch (error) {
      console.error('Failed to get all notes:', error);
      throw error;
    }
  }

  async deleteNote(noteId) {
    await this.init();

    try {
      if (this.pendingSaves.has(noteId)) {
        clearTimeout(this.pendingSaves.get(noteId));
        this.pendingSaves.delete(noteId);
      }

      switch (this.storageType) {
        case 'opfs':
          const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
          await notesDir.removeEntry(`${noteId}.json`);
          break;

        case 'indexeddb':
          const tx = this.db.transaction('notes', 'readwrite');
          const store = tx.objectStore('notes');
          await store.delete(noteId);
          break;

        case 'localstorage':
          localStorage.removeItem(`note_${noteId}`);
          break;
      }
    } catch (error) {
      console.error(`Failed to delete note ${noteId}:`, error);
      throw error;
    }
  }

  async writePassword(noteId, password) {
    await this.init();
    
    try {
      switch (this.storageType) {
        case 'opfs':
          const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
          const fileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(password);
          await writable.close();
          break;
  
        case 'indexeddb':
          const tx = this.db.transaction('passwords', 'readwrite');
          const store = tx.objectStore('passwords');
          await store.put({ noteId, password });
          break;
  
        case 'localstorage':
          localStorage.setItem(`pass_${noteId}`, password);
          break;
      }
    } catch (error) {
      console.error(`Failed to write password for ${noteId}:`, error);
      throw error;
    }
  }
  
  async readPassword(noteId) {
    await this.init();
    
    try {
      switch (this.storageType) {
        case 'opfs':
          const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
          const fileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`);
          const file = await fileHandle.getFile();
          return await file.text();
  
        case 'indexeddb':
          const tx = this.db.transaction('passwords', 'readonly');
          const store = tx.objectStore('passwords');
          const data = await store.get(noteId);
          return data?.password;
  
        case 'localstorage':
          return localStorage.getItem(`pass_${noteId}`);
      }
    } catch (error) {
      console.error(`Failed to read password for ${noteId}:`, error);
      return null;
    }
  }
  
  async deletePassword(noteId) {
    await this.init();
    
    try {
      switch (this.storageType) {
        case 'opfs':
          const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
          await passwordsDir.removeEntry(`${noteId}.pass`);
          break;
  
        case 'indexeddb':
          const tx = this.db.transaction('passwords', 'readwrite');
          const store = tx.objectStore('passwords');
          await store.delete(noteId);
          break;
  
        case 'localstorage':
          localStorage.removeItem(`pass_${noteId}`);
          break;
      }
    } catch (error) {
      console.error(`Failed to delete password for ${noteId}:`, error);
    }
  }
  
  async writeThemePreference(theme) {
    await this.init();
    
    try {
      switch (this.storageType) {
        case 'opfs':
          const fileHandle = await this.root.getFileHandle('theme.txt', { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(theme);
          await writable.close();
          break;
  
        case 'indexeddb':
          const tx = this.db.transaction('preferences', 'readwrite');
          const store = tx.objectStore('preferences');
          await store.put({ key: 'theme', value: theme });
          break;
  
        case 'localstorage':
          localStorage.setItem('theme', theme);
          break;
      }
    } catch (error) {
      console.error('Failed to write theme preference:', error);
      throw error;
    }
  }
  
  async readThemePreference() {
    await this.init();
    
    try {
      switch (this.storageType) {
        case 'opfs':
          const fileHandle = await this.root.getFileHandle('theme.txt');
          const file = await fileHandle.getFile();
          return await file.text();
  
        case 'indexeddb':
          const tx = this.db.transaction('preferences', 'readonly');
          const store = tx.objectStore('preferences');
          const data = await store.get('theme');
          return data?.value || 'system';
  
        case 'localstorage':
          return localStorage.getItem('theme') || 'system';
      }
    } catch (error) {
      return 'system';
    }
  }
  
  async clearAllData() {
    await this.init();
    
    try {
      // Clear any pending saves
      for (const [noteId, timeoutId] of this.pendingSaves.entries()) {
        clearTimeout(timeoutId);
        this.pendingSaves.delete(noteId);
      }
  
      switch (this.storageType) {
        case 'opfs':
          const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
          for await (const [name, _] of notesDir.entries()) {
            await notesDir.removeEntry(name);
          }
          break;
  
        case 'indexeddb':
          const tx = this.db.transaction(['notes', 'passwords', 'preferences'], 'readwrite');
          await tx.objectStore('notes').clear();
          await tx.objectStore('passwords').clear();
          await tx.objectStore('preferences').clear();
          break;
  
        case 'localstorage':
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key.startsWith('note_') || key.startsWith('pass_') || key === 'theme') {
              localStorage.removeItem(key);
            }
          }
          break;
      }
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }
  
  async checkStorageEstimate() {
    try {
      switch (this.storageType) {
        case 'opfs':
        case 'indexeddb':
          const estimate = await navigator.storage.estimate();
          return estimate;
  
        case 'localstorage':
          // Rough estimate for localStorage
          let totalSize = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            totalSize += localStorage.getItem(key).length;
          }
          return {
            usage: totalSize,
            quota: 5 * 1024 * 1024, // Approximate 5MB quota for localStorage
          };
      }
    } catch (error) {
      console.error("Failed to get storage estimate:", error);
      throw error;
    }
  }
  
  async getStorageInfo() {
    await this.init();
    
    try {
      const entries = [];
      let totalSize = 0;
  
      switch (this.storageType) {
        case 'opfs':
          const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
          for await (const [name, handle] of notesDir.entries()) {
            try {
              const file = await handle.getFile();
              const content = await file.text();
              entries.push({
                name,
                size: file.size,
                lastModified: new Date(file.lastModified),
                content: JSON.parse(content)
              });
              totalSize += file.size;
            } catch (error) {
              entries.push({
                name,
                error: error.message
              });
            }
          }
          break;
  
        case 'indexeddb':
          const tx = this.db.transaction('notes', 'readonly');
          const store = tx.objectStore('notes');
          const notes = await store.getAll();
          notes.forEach(note => {
            const size = JSON.stringify(note).length;
            entries.push({
              name: `${note.id}.json`,
              size,
              lastModified: new Date(note.dateModified),
              content: note
            });
            totalSize += size;
          });
          break;
  
        case 'localstorage':
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('note_')) {
              const content = localStorage.getItem(key);
              const size = content.length;
              entries.push({
                name: `${key.replace('note_', '')}.json`,
                size,
                lastModified: new Date(JSON.parse(content).dateModified),
                content: JSON.parse(content)
              });
              totalSize += size;
            }
          }
          break;
      }
  
      return {
        totalSize,
        totalSizeInKB: (totalSize / 1024).toFixed(2),
        entries,
        storageType: this.storageType
      };
    } catch (error) {
      console.error("StorageService - Critical error in getStorageInfo:", error);
      throw error;
    }
  }
  
  async forceCleanStorage() {
    await this.init();
    
    try {
      switch (this.storageType) {
        case 'opfs':
          // Clear root directory
          for await (const [name, _] of this.root.entries()) {
            await this.root.removeEntry(name, { recursive: true });
          }
          break;
  
        case 'indexeddb':
          // Delete and recreate database
          this.db.close();
          await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase('peridot_notes');
            request.onsuccess = resolve;
            request.onerror = reject;
          });
          await this.initIndexedDB();
          break;
  
        case 'localstorage':
          localStorage.clear();
          break;
      }
      
      this.initialized = false;
      await this.init();
    } catch (error) {
      console.error('Failed to force clean storage:', error);
      throw error;
    }
  }
}

export const storageService = new StorageService();