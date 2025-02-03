class PasswordStorageService {
    constructor() {
      this.root = null;
      this.initialized = false;
    }
  
    async init() {
      if (this.initialized) return;
      
      try {
        this.root = await navigator.storage.getDirectory();
        await this.ensurePasswordDirectory();
        this.initialized = true;
      } catch (error) {
        console.error('Failed to initialize OPFS for passwords:', error);
        throw error;
      }
    }
  
    async ensurePasswordDirectory() {
      try {
        await this.root.getDirectoryHandle('passwords', { create: true });
      } catch (error) {
        console.error('Failed to ensure passwords directory:', error);
        throw error;
      }
    }
  
    async storePassword(noteId, password) {
      await this.init();
      
      try {
        const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
        const fileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(password);
        await writable.close();
      } catch (error) {
        console.error(`Failed to store password for note ${noteId}:`, error);
        throw error;
      }
    }
  
    async getPassword(noteId) {
      await this.init();
      
      try {
        const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
        const fileHandle = await passwordsDir.getFileHandle(`${noteId}.pass`);
        const file = await fileHandle.getFile();
        return await file.text();
      } catch (error) {
        console.error(`Failed to get password for note ${noteId}:`, error);
        return null;
      }
    }
  
    async removePassword(noteId) {
      await this.init();
      
      try {
        const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
        await passwordsDir.removeEntry(`${noteId}.pass`);
      } catch (error) {
        console.error(`Failed to remove password for note ${noteId}:`, error);
        throw error;
      }
    }
  
    async clearAllPasswords() {
      await this.init();
      
      try {
        const passwordsDir = await this.root.getDirectoryHandle('passwords', { create: true });
        for await (const [name, _] of passwordsDir.entries()) {
          await passwordsDir.removeEntry(name);
        }
      } catch (error) {
        console.error('Failed to clear all passwords:', error);
        throw error;
      }
    }
  }
  
  export const passwordStorage = new PasswordStorageService();