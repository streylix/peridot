import React, { useState, useEffect, useRef, useCallback } from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';
import LockedWindow from './LockedWindow';
import { noteImportExportService } from '../utils/NoteImportExportService';
import { passwordStorage } from '../utils/PasswordStorageService';
import { decryptNote, encryptNote } from '../utils/encryption';
import { noteUpdateService } from '../utils/NoteUpdateService';

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
      const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true';
      
      if (!verifyBypass) {
        const storedPassword = await passwordStorage.getPassword(lockedParentFolder.id);
        if (!storedPassword || password !== storedPassword) {
          return false;
        }
      }
      
      // Dispatch event to update the folder's state in the UI
      window.dispatchEvent(new CustomEvent('folderUnlocked', {
        detail: { folderId: lockedParentFolder.id }
      }));
      
      setLockedParentFolder(null);
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

  useEffect(() => {
    setIsUnlocked(false);
    setDecryptedNote(null);
    setCurrentPassword(null);
  }, [note?.id]);

  const handleUnlock = async (password) => {
    if (!note) return false;

    try {
      const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true'
      
      if (!verifyBypass){
        const storedPassword = await passwordStorage.getPassword(note.id);
        if ((!storedPassword || password !== storedPassword)) {
          return false;
        }
      }

      const decryptResult = await decryptNote(note, password, false);
      
      if (!decryptResult.success) {
        console.error('Decryption failed:', decryptResult.error);
        return false;
      }

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