class StorageService {
  constructor() {
    this.root = null;
    this.initialized = false;
    this.pendingSaves = new Map();
    this.DEBOUNCE_MS = 1;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      this.root = await navigator.storage.getDirectory();
      await this.ensureNotesDirectory();
      await this.ensurePasswordsDirectory();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize OPFS:', error);
      throw error;
    }
  }

  async ensureNotesDirectory() {
    try {
      await this.root.getDirectoryHandle('notes', { create: true });
    } catch (error) {
      console.error('Failed to ensure notes directory:', error);
      throw error;
    }
  }

  async ensurePasswordsDirectory() {
    try {
      await this.root.getDirectoryHandle('passwords', { create: true });
    } catch (error) {
      console.error('Failed to ensure passwords directory:', error);
      throw error;
    }
  }

  async writeNote(noteId, noteData) {
    await this.init();

    // Clear any pending save for this note
    if (this.pendingSaves.has(noteId)) {
      clearTimeout(this.pendingSaves.get(noteId));
    }

    // Create a new debounced save
    const savePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        try {
          const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
          const fileHandle = await notesDir.getFileHandle(`${noteId}.json`, { create: true });
          
          // If note is locked and encrypted, ensure we maintain encryption state
          let dataToSave = noteData;
          if (noteData.locked && !noteData.encrypted) {
            // Get the stored password
            const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
            try {
              const passFileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`);
              const passFile = await passFileHandle.getFile();
              const password = await passFile.text();
              
              // Re-encrypt with stored password
              const { encryptNote } = await import('./encryption');
              dataToSave = await encryptNote(noteData, password);
            } catch (error) {
              console.error('Failed to re-encrypt note:', error);
            }
          }

          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(dataToSave));
          await writable.close();
          
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

      const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
      const fileHandle = await notesDir.getFileHandle(`${noteId}.json`);
      const file = await fileHandle.getFile();
      const contents = await file.text();
      return JSON.parse(contents);
    } catch (error) {
      console.error(`Failed to read note ${noteId}:`, error);
      throw error;
    }
  }

  async writePassword(noteId, password) {
    await this.init();
    
    try {
      const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
      const fileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(password);
      await writable.close();
    } catch (error) {
      console.error(`Failed to write password for ${noteId}:`, error);
      throw error;
    }
  }

  async readPassword(noteId) {
    await this.init();
    
    try {
      const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
      const fileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      console.error(`Failed to read password for ${noteId}:`, error);
      return null;
    }
  }

  async deletePassword(noteId) {
    await this.init();
    
    try {
      const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
      await passwordsDir.removeEntry(`${noteId}.pass`);
    } catch (error) {
      console.error(`Failed to delete password for ${noteId}:`, error);
    }
  }

  async deleteNote(noteId) {
    await this.init();
    
    try {
      if (this.pendingSaves.has(noteId)) {
        clearTimeout(this.pendingSaves.get(noteId));
        this.pendingSaves.delete(noteId);
      }

      const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
      await notesDir.removeEntry(`${noteId}.json`);
    } catch (error) {
      console.error(`Failed to delete note ${noteId}:`, error);
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
    } catch (error) {
      console.error('Failed to get all notes:', error);
      throw error;
    }
  }

  async writeThemePreference(theme) {
    await this.init();
    
    try {
      const fileHandle = await this.root.getFileHandle('theme.txt', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(theme);
      await writable.close();
    } catch (error) {
      console.error('Failed to write theme preference:', error);
      throw error;
    }
  }

  async readThemePreference() {
    await this.init();
    
    try {
      const fileHandle = await this.root.getFileHandle('theme.txt');
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      return 'system';
    }
  }

  async clearAllData() {
    await this.init();
    
    try {
      for (const [noteId, timeoutId] of this.pendingSaves.entries()) {
        clearTimeout(timeoutId);
        this.pendingSaves.delete(noteId);
      }

      const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
      // const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
      
      for await (const [name, _] of notesDir.entries()) {
        await notesDir.removeEntry(name);
      }
      
      // for await (const [name, _] of passwordsDir.entries()) {
      //   await passwordsDir.removeEntry(name);
      // }
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }

  async checkOPFSAvailability() {
    try {
      console.log("Checking OPFS availability");
      const root = await navigator.storage.getDirectory();
      console.log("OPFS root obtained:", root);
      return true;
    } catch (error) {
      console.error("OPFS not available:", error);
      return false;
    }
  }

  async getStorageInfo() {
    console.log("StorageService - getStorageInfo() called");
    try {
      console.log("StorageService - starting initialization");
      await this.init();
      console.log("StorageService - initialization complete");
      
      console.log("StorageService - getting notes directory");
      const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
      console.log("StorageService - notes directory obtained:", notesDir);
      
      const entries = [];
      let totalSize = 0;
  
      console.log("StorageService - starting directory entries iteration");
      for await (const [name, handle] of notesDir.entries()) {
        console.log("StorageService - processing entry:", name);
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
          console.log("StorageService - processed entry:", name);
        } catch (error) {
          console.error("StorageService - error processing entry:", name, error);
          entries.push({
            name,
            error: error.message
          });
        }
      }
      console.log("StorageService - finished processing entries");
  
      return {
        totalSize: totalSize,
        totalSizeInKB: (totalSize / 1024).toFixed(2),
        entries: entries
      };
    } catch (error) {
      console.error("StorageService - Critical error in getStorageInfo:", error);
      throw error;
    }
  }

  async checkStorageEstimate() {
    try {
      const estimate = await navigator.storage.estimate();
      console.log("Storage estimate:", {
        usage: `${(estimate.usage / 1024 / 1024).toFixed(2)} MB`,
        quota: `${(estimate.quota / 1024 / 1024).toFixed(2)} MB`,
        percentageUsed: `${((estimate.usage / estimate.quota) * 100).toFixed(2)}%`
      });
      return estimate;
    } catch (error) {
      console.error("Failed to get storage estimate:", error);
      throw error;
    }
  }
}

export const storageService = new StorageService();