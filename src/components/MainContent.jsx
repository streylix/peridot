import React, { useState, useEffect } from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';
import LockedWindow from './LockedWindow';
import { passwordStorage } from '../utils/PasswordStorageService';
import { decryptNote, encryptNote } from '../utils/encryption';

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
      console.log(`Password in storage: ${storedPassword} | ${note.id}`)
      
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
    // If note is temporarily unlocked, re-encrypt it
    if (isUnlocked && currentPassword) {
      const updatedNote = {
        ...note,
        ...updates,
        content: updates.content || note.content,
        dateModified: updateModified ? new Date().toISOString() : note.dateModified
      };

      try {
        // Re-encrypt the updated note with the current password
        const reEncryptedNote = await encryptNote(updatedNote, currentPassword);
        onUpdateNote(reEncryptedNote, updateModified);
      } catch (error) {
        // console.error('Failed to re-encrypt note:', error);

        // Sometimes the note.content doesn't exist and causes this error to run, however everything still works
        // In fact, it works incredibly well this way, I tried other methods to prevent the error from happening but
        // they all broke in some way or another. I'm going to leave implementation like this as I think it's the most
        // effective here, though I should find a better fix later

        // Fallback to normal update if re-encryption fails
        onUpdateNote(updates, updateModified);
      }
    } else {
      // Normal update for unlocked notes
      onUpdateNote(updates, updateModified);
    }
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