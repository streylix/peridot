import React, { useEffect, useState, useCallback, useRef } from 'react';
import MarkdownEditor from './MarkdownEditor';
import LockedWindow from './LockedWindow';
import { apiService } from '../utils/ApiService';
import { noteUpdateService } from '../utils/NoteUpdateService';

const TOKEN_KEY = 'peridot.authToken';

function postNative(payload) {
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.peridot) {
      window.webkit.messageHandlers.peridot.postMessage(payload);
    }
  } catch (err) {
    console.warn('postNative failed', err);
  }
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const noteId = params.get('noteId');
  const token = params.get('token');
  const baseUrl = params.get('baseUrl');
  return {
    noteId: noteId ? Number(noteId) : null,
    token,
    baseUrl,
  };
}

export default function EmbedEditor() {
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [decryptedNote, setDecryptedNote] = useState(null);
  const reloadingRef = useRef(false);

  // Store token before any API calls
  useEffect(() => {
    const { token } = readParams();
    if (token) {
      try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
      // apiService reads token in its constructor; re-set so subsequent calls pick it up
      apiService._token = token;
    }
  }, []);

  const loadNote = useCallback(async () => {
    const { noteId } = readParams();
    if (!noteId) {
      setError('No note specified');
      return;
    }
    try {
      const fetched = await apiService.readNote(noteId);
      setNote(fetched);
      setIsUnlocked(!fetched.locked);
      setDecryptedNote(fetched.locked ? null : fetched);
    } catch (err) {
      setError(err.message || 'Failed to load note');
      postNative({ type: 'error', message: err.message });
    }
  }, []);

  useEffect(() => {
    loadNote();
  }, [loadNote]);

  // Listen for noteUpdate events from the update service so the editor stays
  // in sync (and we can push state back to native).
  useEffect(() => {
    const handler = (event) => {
      const updated = event.detail?.note;
      if (!updated || updated.id !== note?.id) return;
      setNote(updated);
      if (!updated.locked) setDecryptedNote(updated);
      postNative({ type: 'noteUpdated', noteId: updated.id });
    };
    window.addEventListener('noteUpdate', handler);
    return () => window.removeEventListener('noteUpdate', handler);
  }, [note?.id]);

  // Expose a tiny native API on window so iOS can drive the embed.
  useEffect(() => {
    window.peridotEmbed = {
      reload: () => {
        if (reloadingRef.current) return;
        reloadingRef.current = true;
        loadNote().finally(() => { reloadingRef.current = false; });
      },
      loadNote: (id) => {
        const url = new URL(window.location.href);
        url.searchParams.set('noteId', String(id));
        window.history.replaceState({}, '', url.toString());
        loadNote();
      },
    };
    postNative({ type: 'ready' });
    return () => { delete window.peridotEmbed; };
  }, [loadNote]);

  const handleUpdateNote = useCallback(async (updates, updateModified = true) => {
    if (!note) return;
    await noteUpdateService.queueUpdate(note.id, updates, updateModified);
  }, [note]);

  const handleUnlock = useCallback(async (password) => {
    if (!note) return false;
    try {
      const result = await apiService.unlockNote(note.id, password);
      if (!result.success) return false;
      setDecryptedNote(result.note);
      setIsUnlocked(true);
      return true;
    } catch {
      return false;
    }
  }, [note]);

  if (error) {
    return (
      <div className="embed-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!note) {
    return <div className="embed-loading" />;
  }

  if (note.locked && !isUnlocked) {
    return (
      <div className="embed-locked">
        <LockedWindow onUnlock={handleUnlock} note={note} />
      </div>
    );
  }

  return (
    <div className="embed-editor-host">
      <MarkdownEditor
        note={decryptedNote || note}
        onUpdateNote={handleUpdateNote}
      />
    </div>
  );
}
