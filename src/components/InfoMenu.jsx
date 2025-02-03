import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleEllipsis, Lock, Pin, Gift, Trash2, Download } from 'lucide-react';
import { noteContentService } from '../utils/NoteContentService';
import { passwordModalUtils } from '../utils/PasswordModalUtils';

const InfoMenu = ({
  selectedId,
  notes,
  onTogglePin,
  onDeleteNote,
  onGifModalOpen,
  position = null,
  onUnlockNote,
  onLockNote,
  onClose,
  downloadNoteId,
  isDownloadable,
  setDownloadable,
  setDownloadNoteId,
  setPdfExportNote,
  setIsPdfExportModalOpen,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const selectedNote = notes.find(note => note.id === selectedId);

  useEffect(() => {
    if (isDownloadable && downloadNoteId) {
      const noteToDownload = notes.find(note => note.id === downloadNoteId);
      const preferredFileType = localStorage.getItem('preferredFileType') || 'json';
      if (noteToDownload) {
        if (preferredFileType === 'pdf') {
          setPdfExportNote(noteToDownload);
          setIsPdfExportModalOpen(true);
          setDownloadable(false);
          setDownloadNoteId(null);
          setIsOpen(false);
          if (onClose) onClose();
        } else {
          noteContentService.performDownload(noteToDownload, preferredFileType);
          setDownloadable(false);
          setDownloadNoteId(null);
        }
      }
    }
  }, [isDownloadable, downloadNoteId, notes, setDownloadable, setDownloadNoteId]);

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
    }
  }, [position]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleLockClick = () => {
    if (selectedNote?.locked) {
      passwordModalUtils.openUnlockModal(selectedNote.id, selectedNote);
    } else {
      passwordModalUtils.openLockModal(selectedNote.id, selectedNote);
    }
    setIsOpen(false);
    if (onClose) onClose();
  };

  const handleDownloadNote = () => {
    if (!selectedNote) return;
  
    if (selectedNote.locked) {
      passwordModalUtils.openDownloadUnlockModal(selectedNote.id, selectedNote);
      setIsOpen(false);
      return;
    }
  
    const preferredFileType = localStorage.getItem('preferredFileType') || 'json';
    
    if (preferredFileType === 'pdf') {
      setPdfExportNote(selectedNote);
      setIsPdfExportModalOpen(true);
    } else {
      noteContentService.performDownload(selectedNote, preferredFileType);
    }
    setIsOpen(false);
    if (onClose) onClose();
  };

  useEffect(() => {
    if (isOpen && menuRef.current) {
      if (position) {
        menuRef.current.style.top = `${position.y}px`;
        menuRef.current.style.left = `${position.x}px`;
      } else if (buttonRef.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect();
        menuRef.current.style.top = `${buttonRect.bottom + 5}px`;
        menuRef.current.style.left = `${buttonRect.left - 100 + buttonRect.width / 2}px`;
      }
    }
  }, [isOpen, position]);

  const handleGifSelect = (gifUrl) => {
    if (selectedNote) {
      const gifEmbed = `<img src="${gifUrl}" alt="GIF" style="max-width: 100%; height: auto;">`;
      const newContent = selectedNote.content + gifEmbed;
    }
  };

  const Menu = () => {
    if (!isOpen) return null;

    return createPortal(
      <div
        ref={menuRef}
        className="info-menu"
      >
        <button
          className={`info-menu-button ${selectedNote ? '' : 'disabled'}`}
          onClick={handleLockClick}
          disabled={!selectedNote}
        >
          <Lock className="info-menu-icon" />
          {selectedNote?.locked ? 'Unlock Note' : 'Lock Note'}
        </button>

        <button
          className={`info-menu-button ${selectedNote ? '' : 'disabled'}`}
          onClick={() => {
            if (selectedNote) {
              onTogglePin(selectedNote.id);
              setIsOpen(false);
              if (onClose) onClose();
            }
          }}
          disabled={!selectedNote}
        >
          <Pin className="info-menu-icon" />
          {selectedNote?.pinned ? 'Unpin Note' : 'Pin Note'}
        </button>

        <button
          className={`info-menu-button ${selectedNote ? '' : 'disabled'}`}
          onClick={() => {
            if (selectedNote && onGifModalOpen) {
              onGifModalOpen();
              setIsOpen(false);
              if (onClose) onClose();
            }
          }}
          disabled={!selectedNote}
        >
          <Gift className="info-menu-icon" />
          Add GIF
        </button>

        <button
          className={`info-menu-button ${selectedNote ? '' : 'disabled'}`}
          onClick={handleDownloadNote}
          disabled={!selectedNote}
          aria-label="Download Note"
        >
          <Download className="info-menu-icon" />
          Download Note
        </button>

        <button
          className={`info-menu-button ${selectedNote ? '' : 'disabled'}`}
          onClick={() => {
            if (selectedNote) {
              onDeleteNote(selectedNote.id);
              setIsOpen(false);
              if (onClose) onClose();
            }
          }}
          disabled={!selectedNote}
        >
          <Trash2 className="info-menu-icon" />
          Delete Note
        </button>
      </div>,
      document.body
    );
  };
  
  if (position) {
    return <Menu />;
  }

  return (
    <>
      {position ? <Menu /> : (
        <button
          ref={buttonRef}
          type="button"
          id="info-menu-btn"
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