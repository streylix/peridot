import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleEllipsis, Lock, Pin, Gift, Trash2, Download } from 'lucide-react';

const InfoMenu = ({
  selectedId,
  notes,
  onTogglePin,
  onDeleteNote,
  onLockModalOpen,
  onUnlockModalOpen,
  position = null,
  onClose
}) => {
  const [isOpen, setIsOpen] = useState(false);
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

        <button className="info-menu-button">
          <Gift className="info-menu-icon" />
          Add GIF
        </button>

        <button
          className={`info-menu-button ${selectedNote ? '' : 'disabled'}`}
          onClick={handleDownloadNote}
          disabled={!selectedNote}
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
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="info-menu-toggle"
      >
        <CircleEllipsis className="info-menu-toggle-icon" />
      </button>
      <Menu />
    </>
  );
};

export default InfoMenu;