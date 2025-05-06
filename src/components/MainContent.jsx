import React, { useState, useEffect, useRef, useCallback } from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';
import LockedWindow from './LockedWindow';
import { noteImportExportService } from '../utils/NoteImportExportService';
import { passwordStorage } from '../utils/PasswordStorageService';
import { decryptNote, encryptNote } from '../utils/encryption';
import { noteUpdateService } from '../utils/NoteUpdateService';
import { storageService } from '../utils/StorageService';

function MainContent({ 
  note, 
  notes, // Make sure this prop is passed from App.jsx
  onUpdateNote, 
  gifToAdd, 
  onGifAdded, 
  setNotes,
  onNoteSelect
}) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [decryptedNote, setDecryptedNote] = useState(null);
  const [currentPassword, setCurrentPassword] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lockedParentFolder, setLockedParentFolder] = useState(null);
  const editorRef = useRef(null);

  const isImageFile = (file) => {
    return file.type.startsWith('image/');
  };

  const isValidImportFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    return ['json', 'md', 'txt'].includes(ext);
  };

  // Add function to check for locked parent folders
  const findLockedParentFolder = useCallback((noteId) => {
    if (!notes || !noteId) return null;
    
    const currentNote = notes.find(n => n.id === noteId);
    if (!currentNote || !currentNote.parentFolderId) return null;
    
    const checkFolder = (folderId) => {
      const folder = notes.find(n => n.id === folderId);
      if (!folder) return null;
      
      // Only block access if the folder is locked AND not opened
      if (folder.locked && !folder.isOpen) return folder;
      
      // Check parent folders recursively
      if (folder.parentFolderId) {
        return checkFolder(folder.parentFolderId);
      }
      
      return null;
    };
    
    return checkFolder(currentNote.parentFolderId);
  }, [notes]);

  // Check for locked parent folders when note changes
  useEffect(() => {
    if (note) {
      const lockedFolder = findLockedParentFolder(note.id);
      setLockedParentFolder(lockedFolder);
    } else {
      setLockedParentFolder(null);
    }
  }, [note, findLockedParentFolder]);

  // Handler for unlocking parent folders
  const handleFolderUnlock = async (password) => {
    if (!lockedParentFolder) return false;
    
    try {
      // Import FolderService
      const { FolderService } = await import('../utils/folderUtils');
      
      // Use the proper unlock folder method
      const result = await FolderService.unlockFolder(lockedParentFolder, password);
      
      if (!result.success) {
        return false;
      }
      
      // Update the folder in state
      setNotes(prevNotes => 
        prevNotes.map(note => 
          note.id === lockedParentFolder.id 
            ? { ...note, isOpen: true } 
            : note
        )
      );
      
      // Allow access to the note
      setLockedParentFolder(null);
      
      // Dispatch event so sidebar can update too
      window.dispatchEvent(new CustomEvent('folderUnlocked', {
        detail: { folderId: lockedParentFolder.id }
      }));
      
      return true;
    } catch (err) {
      console.error('Error unlocking folder:', err);
      return false;
    }
  };

  const handleDragOver = (e) => {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
  
    if (hasFiles) {
      const items = Array.from(e.dataTransfer.items);
      const hasValidImportFile = items.some(item => {
        return item.kind === 'file' && [
          'application/json',
          'text/markdown',
          'text/x-markdown', 
          'text/plain'
        ].includes(item.type);
      });
  
      if (hasValidImportFile) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleImageDrop = async (file, editor) => {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.alt = file.name;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        
        // Create a div wrapper for the image
        const div = document.createElement('div');
        div.appendChild(img);

        // Get current selection or find last caret position
        const selection = window.getSelection();
        let range;

        if (selection.rangeCount > 0) {
          range = selection.getRangeAt(0);
        } else {
          // If no selection, append to end
          range = document.createRange();
          const lastChild = editor.lastChild || editor;
          range.setStartAfter(lastChild);
          range.setEndAfter(lastChild);
        }

        // Insert the div
        range.insertNode(div);
        
        // Move caret after the inserted image
        range.setStartAfter(div);
        range.setEndAfter(div);
        selection.removeAllRanges();
        selection.addRange(range);

        // Trigger content update
        const updatedContent = editor.innerHTML;
        await handleUpdateNote({ content: updatedContent }, true);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to handle image drop:', error);
    }
  };

  const handleDrop = async (e) => {
    const files = Array.from(e.dataTransfer.files);
    const importFiles = files.filter(isValidImportFile);
    const imageFiles = files.filter(isImageFile);

    if (importFiles.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      try {
        await noteImportExportService.importNotes(importFiles, {
          openLastImported: true,
          setSelectedId: onNoteSelect,
          setNotes,
          onError: (error, filename) => {
            console.error(`Error importing ${filename}:`, error);
          }
        });
      } catch (error) {
        console.error('Import failed:', error);
      }
    } else if (imageFiles.length > 0 && note && !note.locked) {
      e.preventDefault();
      e.stopPropagation();

      const editor = document.querySelector('#inner-note');
      if (editor) {
        for (const file of imageFiles) {
          await handleImageDrop(file, editor);
        }
      }
    }
  };

  // Handle automatic unlocking of persistentDecrypted notes
  useEffect(() => {
    if (note) {
      // Always reset password state when switching notes
      setCurrentPassword(null);
      
      // Reset state for locked notes when navigating between notes
      if (note.locked && !note.persistentDecrypted) {
        // For locked notes without persistentDecrypted, reset state
        setIsUnlocked(false);
        setDecryptedNote(null);
      } else if (!note.locked) {
        // For non-locked notes, just set them as unlocked
        setIsUnlocked(true);
        setDecryptedNote(note);
      } else if (note.persistentDecrypted) {
        // Only automatically unlock if it has persistentDecrypted flag
        console.log(`Note ${note.id} has persistentDecrypted flag, auto-unlocking`);
        setIsUnlocked(true);
        setDecryptedNote(note);
      }
    } else {
      // Reset state when no note is selected
      setIsUnlocked(false);
      setDecryptedNote(null);
      setCurrentPassword(null);
    }
  }, [note?.id]);

  const handleUnlock = async (password) => {
    if (!note) return false;

    console.log('MainContent.handleUnlock - Starting unlock attempt:', {
      noteId: note.id,
      isLocked: note.locked,
      isEncrypted: note.encrypted,
      hasKeyParams: !!note.keyParams,
      hasIv: !!note.iv,
      contentType: note.content ? (Array.isArray(note.content) ? 'array' : typeof note.content) : 'unknown'
    });

    try {
      const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true';
      console.log('Password verification bypass:', verifyBypass);
      
      if (!verifyBypass) {
        const storedPassword = await passwordStorage.getPassword(note.id);
        console.log('Password verification:', {
          hasStoredPassword: !!storedPassword,
          passwordMatch: storedPassword ? (password === storedPassword) : 'N/A'
        });
        
        if ((!storedPassword || password !== storedPassword)) {
          console.warn('Password verification failed - either no stored password or mismatch');
          return false;
        }
      }

      console.log('Calling decryptNote function with password:', password ? '[REDACTED]' : 'none');
      const decryptResult = await decryptNote(note, password, false);
      
      console.log('Decrypt result from MainContent:', {
        success: decryptResult.success,
        error: decryptResult.error || 'none'
      });
      
      if (!decryptResult.success) {
        console.error('Decryption failed in MainContent:', decryptResult.error);
        return false;
      }

      console.log('Decryption successful, setting unlocked state');
      const decryptedNote = decryptResult.note;
      
      // Save the decrypted note to storage so it persists when reopening
      try {
        // For session-only decryption - don't add persistentDecrypted flag
        const tempDecryptedNote = {
          ...decryptedNote,
          // Store wasDecrypted flag but not persistentDecrypted
          wasDecrypted: true
        };
        
        // Save the decrypted note to current session only
        await storageService.writeNote(note.id, tempDecryptedNote);
        console.log(`Saved temporary decrypted state for note ${note.id}`);
        
        // Update local state
        setDecryptedNote(tempDecryptedNote);
      } catch (storageError) {
        console.error('Failed to save decrypted note to storage:', storageError);
        // Still update local state even if storage fails
        setDecryptedNote(decryptedNote);
      }
      
      setCurrentPassword(password);
      setIsUnlocked(true);
      return true;
    } catch (err) {
      console.error('Error unlocking note in MainContent:', err);
      return false;
    }
  };

  const handleUpdateNote = async (updates, updateModified = true) => {
    // Only provide encryption context if we're working with a currently unlocked note
    // that has a password and is the same note that was originally unlocked
    const encryptionContext = isUnlocked && currentPassword && note.locked ? {
      shouldEncrypt: true,
      password: currentPassword
    } : null;
    
    await noteUpdateService.queueUpdate(note.id, updates, updateModified, encryptionContext);
  };

  if (!note) {
    return (
      <div 
        className={`main-content ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`empty-state`}>
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`main-content ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ref={editorRef}
    >
      <div className="title-spacer" style={{ height: '40px' }} />
      {lockedParentFolder ? (
        <LockedWindow
          onUnlock={handleFolderUnlock}
          note={lockedParentFolder}
        />
      ) : note?.locked && !isUnlocked ? (
        <LockedWindow
          onUnlock={handleUnlock}
          note={note}
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