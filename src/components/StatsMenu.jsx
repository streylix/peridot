import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const StatsMenu = ({ selectedId, notes }) => {
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
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (isOpen && buttonRef.current && menuRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      menuRef.current.style.top = `${buttonRect.bottom + 5}px`;
      menuRef.current.style.left = `${buttonRect.left - 200 + buttonRect.width / 2}px`;
    }
  }, [isOpen]);

  const countWordsAndChars = (content) => {
    const text = content.replace(/<[^>]*>/g, ' '); // Remove HTML tags
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    const chars = text.replace(/\s/g, '').length;
    return { words: words.length, chars };
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  };

  const Menu = () => {
    if (!isOpen || !selectedNote) return null;

    const stats = countWordsAndChars(selectedNote.content);

    return createPortal(
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          backgroundColor: '#1e1e1e',
          border: '1px solid #333',
          width: '300px',
          borderRadius: '4px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          padding: '16px',
          color: '#c7c7c7'
        }}
      >
        <h3 style={{ 
          marginBottom: '16px', 
          fontSize: '16px', 
          fontWeight: 'bold',
          color: '#c7c7c7' 
        }}>
          Information
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Modified</span>
            <span style={{ color: '#888' }}>{formatDate(selectedNote.dateModified)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Created</span>
            <span style={{ color: '#888' }}>{formatDate(selectedNote.id)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Words</span>
            <span style={{ color: '#888' }}>{stats.words}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Characters</span>
            <span style={{ color: '#888' }}>{stats.chars}</span>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id="info-btn"
        onClick={toggleMenu}
        className="flex items-center justify-center h-8 w-8 rounded hover:bg-gray-700"
        onMouseEnter={e => selectedNote && (e.target.style.opacity = '1')} 
        onMouseLeave={e => selectedNote && (e.target.style.opacity = '0.6')}
        style={{ opacity: selectedNote ? 0.6 : 0.2, cursor: selectedNote ? 'pointer' : 'not-allowed' }}
      >
        <Info className="h-5 w-5 text-gray-400" />
      </button>
      <Menu />
    </>
  );
};

export default StatsMenu;