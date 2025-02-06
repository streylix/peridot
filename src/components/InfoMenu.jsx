import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleEllipsis, Lock, Pin, Gift, Trash2, Download, Edit2 } from 'lucide-react';
import { noteContentService } from '../utils/NoteContentService';
import { passwordModalUtils } from '../utils/PasswordModalUtils';
import { noteImportExportService } from '../utils/NoteImportExportService';
import { FolderService } from '../utils/folderUtils';
import RenameModal from './RenameModal';

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

  const selectedItem = notes.find(item => item.id === selectedId);

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
      if (selectedItem?.locked) {
        passwordModalUtils.openUnlockModal(selectedItem.id, selectedItem);
      } else {
        passwordModalUtils.openLockModal(selectedItem.id, selectedItem);
      }
    } catch (error) {
      console.error('Error in handleLockClick:', error);
    }
  
    setIsOpen(false);
    if (onClose) onClose();
  };

  const handleDownload = () => {
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

  const menuItems = [
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
      disabled: !!selectedItem,
      show: true
    },
    {
      icon: Lock,
      label: selectedItem?.locked ? 'Unlock' : 'Lock',
      onClick: handleLockClick,
      disabled: !!selectedItem,
      show: true
    },
    {
      icon: Pin,
      label: selectedItem?.pinned ? 'Unpin' : 'Pin',
      onClick: () => {
        if (selectedItem) {
          onTogglePin(selectedItem.id);
          setIsOpen(false);
          if (onClose) onClose();
        }
      },
      disabled: !!selectedItem,
      show: true
    },
    {
      icon: Gift,
      label: 'Add GIF',
      onClick: () => {
        if (selectedItem && onGifModalOpen) {
          onGifModalOpen();
          setIsOpen(false);
          if (onClose) onClose();
        }
      },
      show: !position && !FolderService.isFolder(selectedItem) && !!selectedItem
    },
    {
      icon: Download,
      label: 'Download',
      onClick: handleDownload,
      disabled: !!selectedItem,
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
      disabled: !!selectedItem,
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
          .filter(item => item.show)
          .map((item, index) => (
            <button
              key={index}
              className={`info-menu-button ${selectedItem ? '' : 'disabled'}`}
              onClick={item.onClick}
              disabled={!selectedItem}
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