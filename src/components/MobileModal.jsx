import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

const MobileModal = ({ 
  isOpen, 
  onClose, 
  sections = [], 
  title,
  size = 'default',
  className = '' 
}) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Combine all items from all sections into a single array
  const allItems = sections.reduce((acc, section) => {
    if (section.label) {
      acc.push({ 
        type: 'header', 
        content: section.label 
      });
    }
    return acc.concat(section.items.map(item => ({
      type: 'item',
      content: item.content
    })));
  }, []);

  return (
    <div className="modal-overlay">
      <div 
        ref={modalRef}
        className="mobile-modal"
      >
        {/* Header */}
        <div className="mobile-modal-header">
          <h2>{title}</h2>
          <button 
            onClick={onClose}
            className="mobile-close-button"
          >
            <X />
          </button>
        </div>

        {/* Content */}
        <div className="mobile-modal-content">
          {allItems.map((item, index) => (
            <div
              key={index}
              className={item.type === 'header' ? 'mobile-section-header' : 'mobile-item'}
            >
              {item.content}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          animation: overlayFadeIn 0.3s ease forwards;
        }

        .mobile-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          background-color: var(--modal-bg, #ffffff);
          flex-direction: column;
          transform: translateY(100%);
          animation: slideUp 0.3s ease forwards;
        }

        .dark-mode .mobile-modal {
          background-color: #1e1e1e;
        }

        .mobile-modal-header {
          position: sticky;
          top: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          padding-bottom: 0px;
          z-index: 1;
        }

        .mobile-modal-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
        }

        .mobile-close-button {
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
          color: #c7c7c7;
        }

        .mobile-close-button:hover {
          opacity: 1;
        }

        .mobile-modal-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          -webkit-overflow-scrolling: touch;
          padding-top: 0px;
        }

        .mobile-section-header {
          padding: 16px 0 8px 0;
          font-weight: 600;
        }

        .mobile-item {
          padding: 8px 0;
        }

        @keyframes overlayFadeIn {
          from {
            backdrop-filter: blur(0px);
          }
          to {
            backdrop-filter: blur(4px);
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        :global(.dark-mode) .mobile-modal {
          --modal-bg: #1a1a1a;
          --text-secondary: #888;
        }

        :global(.dark-mode) .mobile-close-button {
            color: #c7c7c7;
        }
      `}</style>
    </div>
  );
};

export default MobileModal;