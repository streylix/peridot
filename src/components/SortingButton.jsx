import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SortDesc } from 'lucide-react';
import { noteSortingService } from '../utils/NoteSortingService';

const sortOptions = [
  { value: 'alpha-asc', label: 'A to Z' },
  { value: 'alpha-desc', label: 'Z to A' },
  { value: 'dateModified-desc', label: 'Date Modified (New to Old)' },
  { value: 'dateModified-asc', label: 'Date Modified (Old to New)' },
  { value: 'dateCreated-desc', label: 'Date Created (New to Old)' },
  { value: 'dateCreated-asc', label: 'Date Created (Old to New)' },
];

const SortingButton = ({ onSortChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [currentSort, setCurrentSort] = useState(noteSortingService.getSortMethod());

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!buttonRef.current?.contains(event.target) && 
          !menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current && menuRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      menuRef.current.style.top = `${buttonRect.bottom + 5}px`;
      menuRef.current.style.left = `${buttonRect.left - 120 + buttonRef.current.offsetWidth / 2}px`;
    }
  }, [isOpen]);

  const handleSortSelect = (value) => {
    setCurrentSort(value);
    noteSortingService.setSortMethod(value);
    onSortChange(value);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="new-note-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <SortDesc />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="info-menu"
          style={{ width: '240px' }}
        >
          {sortOptions.map((option) => (
            <button
              key={option.value}
              className={`info-menu-button ${currentSort === option.value ? 'bg-[#0aa34f] text-white' : ''}`}
              onClick={() => handleSortSelect(option.value)}
            >
              {option.label}
              {currentSort === option.value && (
                <span className="float-right">✓</span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default SortingButton;