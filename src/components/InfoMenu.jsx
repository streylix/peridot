import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleEllipsis, Lock, Pin, Gift, Trash2, Download } from 'lucide-react';
import GifSearchModal from './GifModal';
import { getFirstLine } from '../utils/contentUtils';

const InfoMenu = ({
  selectedId,
  notes,
  onTogglePin,
  onDeleteNote,
  onLockModalOpen,
  onUnlockModalOpen,
  onGifModalOpen,
  position = null,
  onClose,
  onUpdateNote
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const selectedNote = notes.find(note => note.id === selectedId);

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
      onUnlockModalOpen();
    } else {
      onLockModalOpen();
    }
    setIsOpen(false);
    if (onClose) onClose();
  };

  const handleDownloadNote = () => {
    if (!selectedNote) return;

    const noteForExport = {
      id: selectedNote.id,
      content: selectedNote.content,
      dateModified: selectedNote.dateModified,
      pinned: selectedNote.pinned,
      locked: selectedNote.locked,
      tempPass: selectedNote.tempPass
    };

    const blob = new Blob([JSON.stringify(noteForExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const noteTitle = getFirstLine(selectedNote.content)
      .replace(/[^a-z0-9]/gi, '_') // Replace non-alphanumeric chars with underscore
      .toLowerCase()
      .slice(0, 50); // Limit length
    const fileName = `${noteTitle}.json`;

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

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
      onUpdateNote(selectedId, { content: newContent });
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