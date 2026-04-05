// encryption.js
// Client-side crypto has been moved to the Django backend (peridot/encryption.py).
// These functions now call the API endpoints so that all AES-GCM / PBKDF2 work
// happens server-side with PostgreSQL storage, never in the browser.
import { apiService } from './ApiService.js';

/**
 * Lock a note — sends plaintext to the backend which encrypts and stores it.
 * Returns the updated (locked) note from the server.
 */
export async function encryptNote(note, password) {
  const locked = await apiService.lockNote(note.id, password);
  return locked;
}

/**
 * Unlock a note for this session — backend decrypts and returns plaintext.
 * The database still holds the encrypted version.
 * Returns { success, note } where note.content is the decrypted HTML.
 */
export async function decryptNote(note, password) {
  try {
    const result = await apiService.unlockNote(note.id, password);
    return { success: true, note: result.note };
  } catch (e) {
    return { success: false, error: e.message || 'Invalid password' };
  }
}

/**
 * Re-encrypt is now handled automatically by ApiService.writeNote when a
 * session password is present. This shim is kept for call-site compatibility.
 */
export async function reEncryptNote(note) {
  return note;
}

/**
 * Permanently remove encryption from a note.
 */
export async function permanentlyUnlockNote(noteId, password) {
  try {
    await apiService.unlockNotePermanent(noteId, password);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || 'Invalid password' };
  }
}
