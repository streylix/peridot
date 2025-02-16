import React, { useState, useEffect, useRef } from 'react';
import { ItemComponents, Modal } from './Modal';
import { noteContentService } from '../utils/NoteContentService';
import { FolderService } from '../utils/folderUtils';

const RenameModal = ({ isOpen, onClose, item, onSuccess }) => {
  const [title, setTitle] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && item) {
      const currentTitle = item.visibleTitle ? 
        item.visibleTitle : 
        noteContentService.getFirstLine(item.content);
      setTitle(currentTitle);
    }
  }, [isOpen, item]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    
    try {
      const updatedItem = await FolderService.renameItem(item, title.trim());
      onSuccess(updatedItem);
      onClose();
    } catch (error) {
      console.error('Failed to rename:', error);
    }
  };

  const sections = [{
    items: [{
      content: (
        <div className="outer-small">
          <ItemComponents.SUBSECTION title="Rename item:">
          <div className="inner-small">
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Enter title"
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="modal-button" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button 
              className="primary" 
              onClick={handleSubmit} 
              style={{ flex: 1 }}
              disabled={!title.trim()}
              >
              Rename
            </button>
          </div>
          </ItemComponents.SUBSECTION>
        </div>
      )
    }]
  }];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rename"
      sections={sections}
      size="small"
    />
  );
};

export default RenameModal;