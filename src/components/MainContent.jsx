import React, { useState, useEffect } from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';
import LockedWindow from './LockedWindow';
import { passwordStorage } from '../utils/PasswordStorageService';
import { decryptNote, encryptNote } from '../utils/encryption';
import { noteUpdateService } from '../utils/NoteUpdateService';

function MainContent({ note, onUpdateNote, gifToAdd, onGifAdded }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [decryptedNote, setDecryptedNote] = useState(null);
  const [currentPassword, setCurrentPassword] = useState(null);

  useEffect(() => {
    // Reset unlock state when note changes
    setIsUnlocked(false);
    setDecryptedNote(null);
    setCurrentPassword(null);
  }, [note?.id]);

  const handleUnlock = async (password) => {
    if (!note) return false;

    try {
      const storedPassword = await passwordStorage.getPassword(note.id);
      
      if (!storedPassword || password !== storedPassword) {
        return false;
      }

      // Attempt to decrypt the note
      const decryptResult = await decryptNote(note, password, false);
      
      if (!decryptResult.success) {
        console.error('Decryption failed:', decryptResult.error);
        return false;
      }

      // Set the decrypted note and mark as unlocked
      setDecryptedNote(decryptResult.note);
      setCurrentPassword(password);
      setIsUnlocked(true);
      return true;
    } catch (err) {
      console.error('Error unlocking note:', err);
      return false;
    }
  };

  const handleUpdateNote = async (updates, updateModified = true) => {
    const encryptionContext = isUnlocked && currentPassword ? {
      shouldEncrypt: true,
      password: currentPassword
    } : null;
    
    await noteUpdateService.queueUpdate(note.id, updates, updateModified, encryptionContext);
  };

  if (!note) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="title-spacer" style={{ height: '40px' }} />
      {note?.locked && !isUnlocked ? (
        <LockedWindow 
          note={note} 
          onUnlock={handleUnlock}
        />
      ) : (
        <NoteEditor
          note={decryptedNote || note}
          onUpdateNote={handleUpdateNote}
          gifToAdd={gifToAdd}
          onGifAdded={onGifAdded}
        />
      )}
    </div>
  );
}

export default MainContent;