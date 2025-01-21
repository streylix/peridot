import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info, Lock, Pin, Gift, Trash2 } from 'lucide-react';

const InfoMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target)) {
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
      menuRef.current.style.left = `${buttonRect.left - 100 + buttonRect.width / 2}px`;
    }
  }, [isOpen]);

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

  const Menu = () => {
    if (!isOpen) return null;

    return createPortal(
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          backgroundColor: '#1e1e1e',
          border: '1px solid #333',
          width: '125px',
          borderRadius: '4px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '4px'
        }}
      >
        <button style={buttonStyle} onMouseEnter={e => e.target.style.opacity = '1'} onMouseLeave={e => e.target.style.opacity = '0.6'}>
          <Lock className="mr-3 h-4 w-4" />
          Lock Note
        </button>

        <button style={buttonStyle} onMouseEnter={e => e.target.style.opacity = '1'} onMouseLeave={e => e.target.style.opacity = '0.6'}>
          <Pin className="mr-3 h-4 w-4" />
          Pin Note
        </button>

        <button style={buttonStyle} onMouseEnter={e => e.target.style.opacity = '1'} onMouseLeave={e => e.target.style.opacity = '0.6'}>
          <Gift className="mr-3 h-4 w-4" />
          Add GIF
        </button>

        <button style={buttonStyle} onMouseEnter={e => e.target.style.opacity = '1'} onMouseLeave={e => e.target.style.opacity = '0.6'}>
          <Trash2 className="mr-3 h-4 w-4" />
          Delete Note
        </button>
      </div>,
      document.body
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="flex items-center justify-center h-8 w-8 rounded hover:bg-gray-700"
      >
        <Info className="h-5 w-5 text-gray-400" />
      </button>
      <Menu />
    </>
  );
};

export default InfoMenu;