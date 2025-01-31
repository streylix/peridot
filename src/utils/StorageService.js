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
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize OPFS:', error);
      throw error;
    }
  }

  async ensureNotesDirectory() {
    console.log("attempting to ensure notes directory")
    try {
      await this.root.getDirectoryHandle('notes', { create: true });
    } catch (error) {
      console.error('Failed to ensure notes directory:', error);
      throw error;
    }
  }

  // Debounced write function
  async writeNote(noteId, noteData) {
    await this.init();
    console.log("calling writeNote")

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
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(noteData));
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
    console.log("reading the note")
    
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
    console.log("retreiving all notes")
    
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
    console.log("writing theme preference")
    
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
    console.log("reading theme preference")
    
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
      for await (const [name, _] of notesDir.entries()) {
        await notesDir.removeEntry(name);
      }
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }
}

export const storageService = new StorageService();