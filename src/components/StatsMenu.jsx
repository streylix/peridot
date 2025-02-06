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
      // Get the editor content div
      const editorContent = document.querySelector('#inner-note');
      if (!editorContent) {
        return { words: 0, chars: 0 };
      }
  
      // Get text content from the editor
      const text = editorContent.textContent || '';
      
      // Count words and characters
      const words = text.trim().split(/\s+/).filter(word => word.length > 0);
      const chars = text.replace(/\s/g, '').length;
  
      return {words: words.length, chars};
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
        className="stats-menu"
        style={{
          position: 'fixed',
          width: '300px',
          borderRadius: '4px',
          zIndex: 100,
          padding: '16px',
        }}
      >
        <h3 className="stats-menu-title">
          Information
        </h3>

        <div className="stats-menu-content">
          <div className="stats-menu-item">
            <span>Modified</span>
            <span className="stats-menu-value">{formatDate(selectedNote.dateModified)}</span>
          </div>

          <div className="stats-menu-item">
            <span>Created</span>
            <span className="stats-menu-value">{formatDate(selectedNote.id)}</span>
          </div>

          <div className="stats-menu-item">
            <span>Words</span>
            <span className="stats-menu-value">{stats.words}</span>
          </div>

          <div className="stats-menu-item">
            <span>Characters</span>
            <span className="stats-menu-value">{stats.chars}</span>
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
        className="stat-btn"
      >
        <Info />
      </button>
      <Menu />
    </>
  );
};

export default StatsMenu;