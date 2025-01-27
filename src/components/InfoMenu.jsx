import React, { useState, useRef, useEffect } from 'react';


function getFirstLine(content) {
  if (!content) return 'untitled';
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  
  const childNodes = Array.from(tempDiv.childNodes);
  
  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) return text;
    }
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent.trim();
      if (text) return text;
    }
  }
  
  return 'untitled';
}
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

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    opacity: '0.6',
    transition: 'opacity 0.2s ease',
    color: '#c7c7c7',
    width: '100%',
  };

  const disabledStyle = {
    ...buttonStyle,
    opacity: '0.3',
    cursor: 'not-allowed'
  };

  const Menu = () => {
    if (!isOpen) return null;

    return createPortal(
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          backgroundColor: '#1e1e1e',
          border: '1px solid #333',
          width: '150px',
          borderRadius: '4px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '4px'
        }}
      >
        <button 
          style={selectedNote ? buttonStyle : disabledStyle}
          onClick={handleLockClick}
          disabled={!selectedNote}
          onMouseEnter={e => selectedNote && (e.target.style.opacity = '1')} 
          onMouseLeave={e => selectedNote && (e.target.style.opacity = '0.6')}
        >
          <Lock className="mr-6 h-4 w-4" />
          {selectedNote?.locked ? 'Unlock Note' : 'Lock Note'}
        </button>

        <button 
          style={selectedNote ? buttonStyle : disabledStyle} 
          onClick={() => {
            if (selectedNote) {
              onTogglePin(selectedNote.id);
              setIsOpen(false);
              if (onClose) onClose();
            }
          }}
          disabled={!selectedNote}
          onMouseEnter={e => selectedNote && (e.target.style.opacity = '1')} 
          onMouseLeave={e => selectedNote && (e.target.style.opacity = '0.6')}
        >
          <Pin className="mr-6 h-4 w-4" />
          {selectedNote?.pinned ? 'Unpin Note' : 'Pin Note'}
        </button>

        <button style={buttonStyle} onMouseEnter={e => e.target.style.opacity = '1'} onMouseLeave={e => e.target.style.opacity = '0.6'}>
          <Gift className="mr-6 h-4 w-4" />
          Add GIF
        </button>

        <button 
          style={selectedNote ? buttonStyle : disabledStyle}
          onClick={handleDownloadNote}
          disabled={!selectedNote}
          onMouseEnter={e => selectedNote && (e.target.style.opacity = '1')} 
          onMouseLeave={e => selectedNote && (e.target.style.opacity = '0.6')}
        >
          <Download className="mr-6 h-4 w-4" />
          Download Note
        </button>

        <button 
          style={selectedNote ? buttonStyle : disabledStyle}
          onClick={() => {
            if (selectedNote) {
              onDeleteNote(selectedNote.id);
              setIsOpen(false);
              if (onClose) onClose();
            }
          }}
          disabled={!selectedNote}
          onMouseEnter={e => selectedNote && (e.target.style.opacity = '1')} 
          onMouseLeave={e => selectedNote && (e.target.style.opacity = '0.6')}
        >
          <Trash2 className="mr-6 h-4 w-4" />
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
        className="flex items-center justify-center h-8 w-8 rounded hover:bg-gray-700"
      >
        <CircleEllipsis className="h-5 w-5 text-gray-400" />
      </button>
      <Menu />
    </>
  );
};

export default InfoMenu;