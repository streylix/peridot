/**
 * ApiService — replaces StorageService.
 * All persistence now goes through the Django REST API backed by PostgreSQL.
 * Encryption is handled server-side; this service manages the in-memory
 * session password map (cleared on page refresh).
 */

const BASE = '/api';

const TOKEN_KEY = 'peridot.authToken';

class ApiService {
  constructor() {
    // In-memory session passwords for locked-but-unlocked notes.
    // Never persisted to disk/OPFS — clears on tab close.
    this._sessionPasswords = new Map();
    this._token = (typeof localStorage !== 'undefined') ? localStorage.getItem(TOKEN_KEY) : null;
  }

  _setToken(token) {
    this._token = token || null;
    if (typeof localStorage === 'undefined') return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  _headers(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
    return headers;
  }

  async _fetch(path, options = {}) {
    const resp = await fetch(`${BASE}${path}`, {
      ...options,
      headers: this._headers(options.headers || {}),
    });
    return resp;
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async login(username, password, newPassword) {
    const body = newPassword
      ? { username, password, newPassword }
      : { username, password };
    const resp = await this._fetch('/auth/login/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      let msg = 'Invalid credentials';
      try { msg = (await resp.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    const data = await resp.json();
    if (data.token) this._setToken(data.token);
    return data;
  }

  async logout() {
    try { await this._fetch('/auth/logout/', { method: 'POST' }); } catch {}
    this._setToken(null);
    this._sessionPasswords.clear();
  }

  async me() {
    if (!this._token) return null;
    const resp = await this._fetch('/auth/me/');
    if (resp.status === 401 || resp.status === 403) {
      this._setToken(null);
      return null;
    }
    if (!resp.ok) return null;
    return resp.json();
  }

  // ---------------------------------------------------------------------------
  // Notes CRUD (same interface as old StorageService)
  // ---------------------------------------------------------------------------

  async getAllNotes() {
    const resp = await this._fetch('/notes/');
    if (!resp.ok) throw new Error('Failed to fetch notes');
    return resp.json();
  }

  async readNote(noteId) {
    const resp = await this._fetch(`/notes/${noteId}/`);
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`Failed to read note ${noteId}`);
    return resp.json();
  }

  async writeNote(noteId, noteData) {
    // Check if the note already exists
    const existing = await this.readNote(noteId);

    if (existing) {
      // PUT — update
      const payload = { ...noteData };

      // If locked and we have a session password, send it so the backend can re-encrypt
      if (existing.locked && noteData.content && !payload.password) {
        const pw = this._sessionPasswords.get(noteId);
        if (pw) payload.password = pw;
      }

      const resp = await this._fetch(`/notes/${noteId}/`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`Failed to update note ${noteId}`);
      return resp.json();
    }

    // POST — create
    const resp = await this._fetch('/notes/', {
      method: 'POST',
      body: JSON.stringify({ ...noteData, id: noteId }),
    });
    if (!resp.ok) throw new Error(`Failed to create note ${noteId}`);
    return resp.json();
  }

  async deleteNote(noteId) {
    const resp = await this._fetch(`/notes/${noteId}/`, { method: 'DELETE' });
    if (!resp.ok && resp.status !== 404) throw new Error(`Failed to delete note ${noteId}`);
    this._sessionPasswords.delete(noteId);
  }

  // ---------------------------------------------------------------------------
  // Lock / Unlock
  // ---------------------------------------------------------------------------

  async lockNote(noteId, password, confirmPassword = null) {
    const body = { password };
    if (confirmPassword) body.confirmPassword = confirmPassword;
    const resp = await this._fetch(`/notes/${noteId}/lock/`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Lock failed');
    }
    // Store password in session for re-encryption on save
    this._sessionPasswords.set(noteId, password);
    return resp.json();
  }

  async unlockNote(noteId, password) {
    const resp = await this._fetch(`/notes/${noteId}/unlock/`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Invalid password');
    // Store password for re-encryption on subsequent saves
    this._sessionPasswords.set(noteId, password);
    return data;
  }

  async unlockNotePermanent(noteId, password) {
    const resp = await this._fetch(`/notes/${noteId}/unlock_permanent/`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Invalid password');
    this._sessionPasswords.delete(noteId);
    return data;
  }

  // ---------------------------------------------------------------------------
  // Session password helpers
  // ---------------------------------------------------------------------------

  storeSessionPassword(noteId, password) {
    this._sessionPasswords.set(noteId, password);
  }

  getSessionPassword(noteId) {
    return this._sessionPasswords.get(noteId) || null;
  }

  removeSessionPassword(noteId) {
    this._sessionPasswords.delete(noteId);
  }

  // ---------------------------------------------------------------------------
  // GIF search proxy
  // ---------------------------------------------------------------------------

  async searchGifs(query) {
    const resp = await this._fetch(`/gifs/search/?q=${encodeURIComponent(query)}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.data || [];
  }

  // ---------------------------------------------------------------------------
  // Legacy compatibility shims (Settings page uses these)
  // ---------------------------------------------------------------------------

  getAvailableStorageTypes() {
    return [{ value: 'api', label: 'Server (PostgreSQL)' }];
  }

  getCurrentStorageType() {
    return 'api';
  }

  async checkStorageEstimate() {
    // Not meaningful for a server backend
    return { usage: 0, quota: Infinity };
  }

  async getStorageInfo() {
    const notes = await this.getAllNotes();
    const totalSize = notes.reduce((sum, n) => sum + JSON.stringify(n).length, 0);
    return {
      totalSize,
      totalSizeInKB: (totalSize / 1024).toFixed(2),
      entries: notes.map(n => ({
        name: `${n.id}.json`,
        size: JSON.stringify(n).length,
        lastModified: new Date(n.dateModified),
        content: n,
      })),
      storageType: 'api',
    };
  }

  async clearAllData() {
    const notes = await this.getAllNotes();
    await Promise.all(notes.map(n => this.deleteNote(n.id)));
  }

  // Theme preference — keep in localStorage (client-only preference)
  async readThemePreference() {
    return localStorage.getItem('theme') || 'system';
  }

  async writeThemePreference(theme) {
    localStorage.setItem('theme', theme);
  }

  // Storage type selection — no-op for API backend
  async setPreferredStorage() {
    return 'api';
  }

  async forceCleanStorage() {
    await this.clearAllData();
    this.initialized = false;
  }
}

export const apiService = new ApiService();

// Keep the old name so import sites that still say `storageService` work
// without a rename pass — both names point to the same instance.
export const storageService = apiService;
