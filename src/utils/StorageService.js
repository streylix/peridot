import TurndownService from 'turndown';
import { marked } from 'marked';

class StorageService {
  constructor() {
    this.root = null;
    this.initialized = false;
    this.pendingSaves = new Map();
    this.DEBOUNCE_MS = 1;
    this.storageType = null;
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    });

    // Configure turndown to handle custom elements and preserve GIFs, images
    this.configureTurndown();
  }

  configureTurndown() {
    // Preserve GIF and image elements
    this.turndown.addRule('images', {
      filter: ['img'],
      replacement: function(content, node) {
        const alt = node.alt || '';
        const src = node.getAttribute('src') || '';
        return `![${alt}](${src})`;
      }
    });

    // Handle empty divs/line breaks
    this.turndown.addRule('lineBreaks', {
      filter: ['div', 'p'],
      replacement: function(content, node) {
        // If it's empty or just whitespace, return a newline
        if (!content.trim()) {
          return '\n';
        }
        // Otherwise return content with newlines
        return '\n' + content + '\n';
      }
    });
  }

  getAvailableStorageTypes() {
    const types = [];
    
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
      types.push({ value: 'opfs', label: 'Origin Private File System (OPFS)' });
    }
    
    if (window.indexedDB) {
      types.push({ value: 'indexeddb', label: 'IndexedDB' });
    }
    
    if (this.isLocalStorageAvailable()) {
      types.push({ value: 'localstorage', label: 'LocalStorage' });
    }
    
    return types;
  }

  getCurrentStorageType() {
    return this.storageType || localStorage.getItem('preferredStorage') || 'auto';
  }

  async init() {
    if (this.initialized) return;
    
    try {
      // Get preferred storage type from localStorage
      const preferredStorage = localStorage.getItem('preferredStorage');
      
      if (preferredStorage && preferredStorage !== 'auto') {
        // Check if preferred storage is available
        if (this.isStorageTypeAvailable(preferredStorage)) {
          this.storageType = preferredStorage;
          switch (preferredStorage) {
            case 'opfs':
              this.root = await navigator.storage.getDirectory();
              await this.ensureNotesDirectory();
              await this.ensurePasswordsDirectory();
              break;
  
            case 'indexeddb':
              await this.initIndexedDB();
              break;
  
            case 'localstorage':
              // No initialization needed
              break;
          }
          
          this.initialized = true;
          return;
        }
      }
  
      // Automatic storage selection if no preference or preferred not available
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        this.root = await navigator.storage.getDirectory();
        await this.ensureNotesDirectory();
        await this.ensurePasswordsDirectory();
        this.storageType = 'opfs';
      } else if (window.indexedDB) {
        await this.initIndexedDB();
        this.storageType = 'indexeddb';
      } else if (this.isLocalStorageAvailable()) {
        this.storageType = 'localstorage';
      } else {
        throw new Error('No storage mechanism available');
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize storage:', error);
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

  async migrateContentToMarkdown(content, format) {
    if (!content) return '';
    
    // If it's already markdown, return as is
    if (format === 'markdown') return content;

    try {
      // Convert HTML to Markdown
      const markdown = this.turndown.turndown(content);
      return markdown;
    } catch (error) {
      console.error('Failed to convert HTML to Markdown:', error);
      // If conversion fails, return original content
      return content;
    }
  }

  async writeNote(noteId, noteData) {
    await this.init();

    if (this.pendingSaves.has(noteId)) {
      clearTimeout(this.pendingSaves.get(noteId));
    }

    const savePromise = new Promise(async (resolve, reject) => {
      try {
        // Handle migration if needed
        if (!noteData.format || noteData.format === 'html') {
          noteData = {
            ...noteData,
            content: await this.migrateContentToMarkdown(noteData.content, 'html'),
            format: 'markdown',
            originalContent: noteData.content, // Keep original content temporarily
            migrationDate: new Date().toISOString()
          };
        }

        // For locked notes, we need to handle encryption
        if (noteData.locked && !noteData.encrypted) {
          const { encryptNote } = await import('./encryption');
          const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
          
          try {
            const passFileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`);
            const passFile = await passFileHandle.getFile();
            const password = await passFile.text();
            
            noteData = await encryptNote(noteData, password);
          } catch (error) {
            // console.error('Failed to re-encrypt note:', error);
          }
        }

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
    });

    const timeoutId = setTimeout(() => savePromise, this.DEBOUNCE_MS);
    this.pendingSaves.set(noteId, timeoutId);
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
      const noteData = JSON.parse(contents);

      // If note is in HTML format, migrate it
      if (!noteData.format || noteData.format === 'html') {
        const migratedContent = await this.migrateContentToMarkdown(noteData.content, 'html');
        const migratedNote = {
          ...noteData,
          content: migratedContent,
          format: 'markdown',
          originalContent: noteData.content,
          migrationDate: new Date().toISOString()
        };

        // Save migrated version
        await this.writeNote(noteId, migratedNote);
        return migratedNote;
      }

      return noteData;
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

      const notesDir = await this.root.getDirectoryHandle('notes', { create: true });
      const notes = [];

      for await (const [name, handle] of notesDir.entries()) {
        if (name.endsWith('.json')) {
          const file = await handle.getFile();
          const contents = await file.text();
          const noteData = JSON.parse(contents);

          // Migrate if needed
          if (!noteData.format || noteData.format === 'html') {
            const migratedContent = await this.migrateContentToMarkdown(noteData.content, 'html');
            const migratedNote = {
              ...noteData,
              content: migratedContent,
              format: 'markdown',
              originalContent: noteData.content,
              migrationDate: new Date().toISOString()
            };

            // Save migrated version
            await this.writeNote(noteData.id, migratedNote);
            notes.push(migratedNote);
          } else {
            notes.push(noteData);
          }
        }
      }

      return notes;
    } catch (error) {
      console.error('Failed to get all notes:', error);
      throw error;
    }
  }

  // Utility function to render markdown to HTML for display
  renderMarkdownToHtml(markdown) {
    if (!markdown) return '';
    try {
      return marked(markdown, {
        breaks: true,
        gfm: true
      });
    } catch (error) {
      console.error('Failed to render markdown:', error);
      return markdown;
    }
  }

  // Utility function to get the first line as title
  getTitle(content, format = 'markdown') {
    if (!content) return 'Untitled';

    if (format === 'markdown') {
      // Split by newlines and find first non-empty line
      const lines = content.split('\n');
      const title = lines.find(line => line.trim()) || 'Untitled';
      // Remove markdown header symbols if present
      return title.replace(/^#+\s+/, '').trim();
    }

    // Fallback for HTML content
    const match = content.match(/<div[^>]*>(.*?)<\/div>/);
    return match ? match[1] : 'Untitled';
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

      // Also remove password file if it exists
      try {
        const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
        await passwordsDir.removeEntry(`${noteId}.pass`);
      } catch (error) {
        // Ignore error if password file doesn't exist
      }
    } catch (error) {
      console.error(`Failed to delete note ${noteId}:`, error);
      throw error;
    }
  }

  // Migration helpers
  async validateMigration(noteId) {
    try {
      const note = await this.readNote(noteId);
      if (note.format !== 'markdown') {
        throw new Error('Note not properly migrated');
      }
      if (!note.content) {
        throw new Error('Migrated note has no content');
      }
      return true;
    } catch (error) {
      console.error(`Migration validation failed for note ${noteId}:`, error);
      return false;
    }
  }

  async rollbackMigration(noteId) {
    try {
      const note = await this.readNote(noteId);
      if (note.originalContent) {
        note.content = note.originalContent;
        note.format = 'html';
        delete note.originalContent;
        delete note.migrationDate;
        await this.writeNote(noteId, note);
      }
    } catch (error) {
      console.error(`Rollback failed for note ${noteId}:`, error);
      throw error;
    }
  }

  isStorageTypeAvailable(type) {
    switch (type) {
      case 'opfs':
        return 'storage' in navigator && 'getDirectory' in navigator.storage;
      case 'indexeddb':
        return !!window.indexedDB;
      case 'localstorage':
        return this.isLocalStorageAvailable();
      default:
        return false;
    }
  }

  isLocalStorageAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  async setPreferredStorage(type) {
    if (!this.isStorageTypeAvailable(type)) {
      throw new Error(`Storage type ${type} is not available`);
    }

    localStorage.setItem('preferredStorage', type);
    
    // Reset service
    this.initialized = false;
    this.storageType = null;
    this.root = null;
    
    // Reinitialize with new storage type
    await this.init();
    
    return this.getCurrentStorageType();
  }

  // Rest of the StorageService methods...
}

export const storageService = new StorageService();

/*
// Old HTML format
{
  content: "<div>Title</div><div>Content</div>",
  format: "html"
}

// New Markdown format
{
  content: "# Title\nContent",
  format: "markdown",
  migrationDate: "2024-02-17T..."  // If migrated
}
*/

/* Note Object Structure
{
  id: number,
  content: string,         // Now in Markdown format
  format: "markdown",      // Format identifier
  dateModified: string,
  dateCreated: string,
  pinned: boolean,
  locked: boolean,
  encrypted: boolean,      // For encrypted notes
  migrationDate?: string,  // Present if migrated
  originalContent?: string // Temporary during migration
}
*/