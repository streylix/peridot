import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleEllipsis, Lock, Pin, Gift, Trash2, Download, Edit2, FileText } from 'lucide-react';
import { passwordModalUtils } from '../utils/PasswordModalUtils';
import { noteImportExportService } from '../utils/NoteImportExportService';
import { FolderService } from '../utils/folderUtils';
import { storageService } from '../utils/StorageService';

const InfoMenu = ({ 
  selectedId,
  notes,
  onTogglePin,
  onDeleteNote,
  onGifModalOpen,
  position = null,
  onClose,
  downloadNoteId,
  isDownloadable,
  setDownloadable,
  setDownloadNoteId,
  setPdfExportNote,
  setIsPdfExportModalOpen,
  setNotes,
  onNoteSelect
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const selectedItem = notes.find(item => item.id === selectedId);
  const isFolder = selectedItem && FolderService.isFolder(selectedItem);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const isClickInsideButton = buttonRef.current?.contains(event.target);
      const isClickInsideMenu = menuRef.current?.contains(event.target);

      if (!isClickInsideButton && !isClickInsideMenu) {
        setIsOpen(false);
        if (onClose) onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (position) {
      setIsOpen(true);
      if (menuRef.current) {
        menuRef.current.style.top = `${position.y}px`;
        menuRef.current.style.left = `${position.x}px`;
      }
    }
  }, [position]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleLockClick = () => {
    try {
      if (isFolder) {
        if (selectedItem?.locked) {
          passwordModalUtils.openUnlockFolderPermanentModal(selectedItem.id, selectedItem);
        } else {
          passwordModalUtils.openLockFolderModal(selectedItem.id, selectedItem);
        }
      } else {
        if (selectedItem?.locked) {
          passwordModalUtils.openUnlockModal(selectedItem.id, selectedItem);
        } else {
          passwordModalUtils.openLockModal(selectedItem.id, selectedItem);
        }
      }
    } catch (error) {
      console.error('Error in handleLockClick:', error);
    }
  
    setIsOpen(false);
    if (onClose) onClose();
  };

  const handleDownload = () => {
    if (isFolder) {
      if (selectedItem.locked) {
        // For locked folders, open password modal
        passwordModalUtils.openDownloadLockModal(selectedItem.id, selectedItem);
        setIsOpen(false);
        return;
      }

      try {
        const preferredFileType = localStorage.getItem('preferredFileType') || 'json';
        FolderService.downloadFolder(selectedItem, notes, preferredFileType);
      } catch (error) {
        console.error('Folder download failed:', error);
      }
      setIsOpen(false);
      return;
    }

    if (!selectedItem) return;

    if (selectedItem.locked) {
      passwordModalUtils.openDownloadUnlockModal(
        selectedItem.id, 
        selectedItem, 
        {
          setPdfExportNote,
          setIsPdfExportModalOpen
        }
      );
      setIsOpen(false);
      return;
    }
  
    const preferredFileType = localStorage.getItem('preferredFileType') || 'json';
    noteImportExportService.downloadNote({
      note: selectedItem,
      fileType: preferredFileType,
      isEncrypted: false,
      onPdfExport: (note) => {
        setPdfExportNote(note);
        setIsPdfExportModalOpen(true);
      }
    });
    
    setIsOpen(false);
  };


  const createNewNoteInFolder = async () => {
    if (!isFolder) return;
  
    const newNote = {
      id: Date.now(),
      content: '',
      dateModified: new Date().toISOString(),
      pinned: false,
      caretPosition: 0,
      parentFolderId: selectedItem.id,
    };
  
    try {
      await storageService.writeNote(newNote.id, newNote);
      
      // Update notes in the parent component
      setNotes(prevNotes => [
        ...prevNotes, 
        newNote
      ]);
  
      // Select the new note
      onNoteSelect(newNote.id);
    } catch (error) {
      console.error('Failed to create note in folder:', error);
    }
  };

  const menuItems = [
    {
      icon: FileText,
      label: 'New Note',
      onClick: createNewNoteInFolder,
      disabled: !isFolder,
      show: isFolder
    },
    {
      icon: Edit2,
      label: 'Rename',
      onClick: () => {
        if (selectedItem) {
          window.dispatchEvent(new CustomEvent('openRenameModal', { 
            detail: { item: selectedItem }
          }));
          setIsOpen(false);
          if (onClose) onClose();
        }
      },
      disabled: !selectedItem,
      show: true
    },
    {
      icon: Lock,
      label: isFolder 
        ? (selectedItem?.locked ? 'Unlock Folder' : 'Lock Folder')
        : (selectedItem?.locked ? 'Unlock' : 'Lock'),
      onClick: handleLockClick,
      disabled: !selectedItem,
      show: true
    },
    {
      icon: Pin,
      label: isFolder 
      ? (selectedItem?.pinned ? 'Unpin Folder' : 'Pin Folder') 
      : (selectedItem?.pinned ? 'Unpin' : 'Pin'),
      onClick: () => {
        if (selectedItem) {
          onTogglePin(selectedItem.id);
          setIsOpen(false);
          if (onClose) onClose();
        }
      },
      disabled: !selectedItem,
      show: true
    },
    {
      icon: Gift,
      label: 'Add GIF',
      onClick: () => {
        if (selectedItem && !isFolder && onGifModalOpen) {
          onGifModalOpen();
          setIsOpen(false);
          if (onClose) onClose();
        }
      },
      show: !position && !FolderService.isFolder(selectedItem) && !!selectedItem,
      disabled: isFolder && !!selectedItem,
    },
    {
      icon: Download,
      label: isFolder ? 'Download Folder' : 'Download',
      onClick: handleDownload,
      disabled: !selectedItem,
      show: true
    },
    {
      icon: Trash2,
      label: 'Delete',
      onClick: () => {
        if (selectedItem) {
          onDeleteNote(selectedItem.id);
          setIsOpen(false);
          if (onClose) onClose();
        }
      },
      disabled: !selectedItem,
      show: true
    }
  ];

  const Menu = () => {
    if ((!isOpen && !position) || (!isOpen && position)) return null;

    return createPortal(
      <div
        ref={menuRef}
        className="info-menu"
        style={{
          position: 'fixed',
          top: position ? position.y : 0,
          left: position ? position.x : 0
        }}
      >
        {menuItems
          .filter(item => item.show !== false)
          .map((item, index) => (
            <button
              key={index}
              className={`info-menu-button ${item.disabled ? 'disabled' : ''}`}
              onClick={item.onClick}
              disabled={item.disabled}
            >
              <item.icon className="info-menu-icon" />
              {item.label}
            </button>
          ))}
      </div>,
      document.body
    );
  };

  useEffect(() => {
    if (menuRef.current && !position && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      menuRef.current.style.top = `${buttonRect.bottom + 5}px`;
      menuRef.current.style.left = `${buttonRect.left - 100 + buttonRect.width / 2}px`;
    }
  }, [isOpen, position]);

  return (
    <>
      {position ? <Menu /> : (
        <button
          ref={buttonRef}
          type="button"
          id="info-menu-btn"
          data-testid="info-menu-btn"
          onClick={toggleMenu}
          className="info-menu-toggle"
        >
          <CircleEllipsis />
        </button>
      )}
      <Menu />
    </>
  );
};

export default InfoMenu;