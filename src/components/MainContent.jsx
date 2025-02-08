import React, { useState, useEffect, useRef } from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';
import LockedWindow from './LockedWindow';
import { noteImportExportService } from '../utils/NoteImportExportService';
import { passwordStorage } from '../utils/PasswordStorageService';
import { decryptNote, encryptNote } from '../utils/encryption';
import { noteUpdateService } from '../utils/NoteUpdateService';

function MainContent({ 
  note, 
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

  const handleDragOver = (e) => {
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
  
    if (hasFiles) {
      const items = Array.from(e.dataTransfer.items);
      const hasValidFile = items.some(item => {
        return item.kind === 'file' && ([
          'application/json',
          'text/markdown',
          'text/x-markdown', 
          'text/plain',
          'application/zip',
          'application/x-zip-compressed'
        ].includes(item.type) || 
        item.type === '' && item.getAsFile().name.toLowerCase().endsWith('.zip'));
      });
  
      if (hasValidFile) {
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

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['json', 'md', 'txt', 'zip'].includes(ext);
    });
  
    if (validFiles.length > 0) {
      try {
        const zipFiles = validFiles.filter(file => file.name.toLowerCase().endsWith('.zip'));
        const otherFiles = validFiles.filter(file => !file.name.toLowerCase().endsWith('.zip'));
  
        // Handle regular files
        if (otherFiles.length > 0) {
          await noteImportExportService.importNotes(otherFiles, {
            openLastImported: true,
            setSelectedId: onNoteSelect,
            setNotes,
            onError: (error, filename) => {
              console.error(`Error importing ${filename}:`, error);
            }
          });
        }
  
        // Handle ZIP files
        for (const zipFile of zipFiles) {
          const { ZipImportHandler } = await import('../utils/ZipImportHandler');
          await ZipImportHandler.importZip(zipFile, {
            setNotes,
            onNoteSelect
          });
        }
      } catch (error) {
        console.error('Import failed:', error);
      }
    }
  };

  // Rest of the existing MainContent component remains the same
  useEffect(() => {
    // Reset unlock state when note changes
    setIsUnlocked(false);
    setDecryptedNote(null);
    setCurrentPassword(null);
  }, [note?.id]);

  const handleUnlock = async (password) => {
    if (!note) return false;

    try {
      const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true'
      const storedPassword = await passwordStorage.getPassword(note.id);
      
      if (!verifyBypass){
        if ((!storedPassword || password !== storedPassword)) {
          return false;
        }
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
    >
      <div className="title-spacer" style={{ height: '40px' }} />
      {note?.locked && !isUnlocked ? (
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