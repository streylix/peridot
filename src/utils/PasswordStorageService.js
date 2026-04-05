// PasswordStorageService.js
// Previously used OPFS to persist session passwords client-side.
// Now passwords are held in memory only via ApiService._sessionPasswords.
// This shim keeps the old call-sites working without changes.
import { apiService } from './ApiService.js';

class PasswordStorageService {
  async storePassword(noteId, password) {
    apiService.storeSessionPassword(noteId, password);
  }

  async getPassword(noteId) {
    return apiService.getSessionPassword(noteId);
  }

  async removePassword(noteId) {
    apiService.removeSessionPassword(noteId);
  }

  async clearAllPasswords() {
    apiService._sessionPasswords.clear();
  }
}

export const passwordStorage = new PasswordStorageService();
