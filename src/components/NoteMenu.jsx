import React, { useState } from 'react';
import { Download, Lock, Trash2, PinTop, Share, History, Copy } from 'lucide-react';

function NoteMenu({ note, onPin, onLock, onDelete, onDuplicate, onSave }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(note)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title || 'note'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="note-menu">
      <button className="menu-trigger" onClick={() => setIsOpen(!isOpen)}>
        ⋮
      </button>
      {isOpen && (
        <div className="menu-dropdown">
          <button onClick={() => { onPin(note.id); setIsOpen(false); }}>
            <PinTop size={16} /> Pin to Top
          </button>
          <button onClick={() => { onLock(note.id); setIsOpen(false); }}>
            <Lock size={16} /> Lock Note
          </button>
          <button onClick={() => { onDuplicate(note.id); setIsOpen(false); }}>
            <Copy size={16} /> Duplicate Note
          </button>
          <button onClick={handleExport}>
            <Download size={16} /> Export Note
          </button>
          <button onClick={() => { onDelete(note.id); setIsOpen(false); }}>
            <Trash2 size={16} /> Delete Note
          </button>
          <div className="menu-separator" />
          <button disabled>
            <Share size={16} /> Share
          </button>
          <button disabled>
            <History size={16} /> History
          </button>
        </div>
      )}
    </div>
  );
}

// Add CSS
const styles = `
.note-menu {
  position: relative;
}

.menu-trigger {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
}

.menu-trigger:hover {
  background: #333;
}

.menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
  min-width: 200px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  z-index: 1000;
}

.menu-dropdown button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: #c7c7c7;
  text-align: left;
  cursor: pointer;
}

.menu-dropdown button:hover {
  background: #333;
}

.menu-dropdown button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-separator {
  height: 1px;
  background: #333;
  margin: 4px 0;
}
`;