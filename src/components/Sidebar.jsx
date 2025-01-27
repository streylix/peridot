import React, { useState } from 'react';
import { SquarePen, Pin, Lock } from 'lucide-react';
import MainContent from './MainContent';
import InfoMenu from './InfoMenu';
import logo from '../assets/logo.png';

function getFirstLine(content) {
  if (!content) return 'Untitled';
  
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
  
  return 'Untitled';
}

function getPreviewContent(content) {
  if (!content) return '';
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;

  const divs = tempDiv.getElementsByTagName('div');
  
  if (divs.length > 1) {
    const preview = Array.from(divs)
      .slice(1)
      .map(div => div.textContent.trim())
      .join(' ');
    
    return preview;
  }
  
  return '';
}

function Sidebar({ 
  selectedId, 
  onNoteSelect, 
  notes, 
  setNotes, 
  onUnlockNote,
  onTogglePin,
  onDeleteNote,
  onLockModalOpen,
  onUnlockModalOpen
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState(null);

  const createNewNote = () => {
    const newNote = {
      id: Date.now(),
      title: '',
      content: '',
      dateModified: new Date().toISOString(),
      pinned: false,
      caretPosition: 0
    };

    setNotes(prevNotes => {
      const updatedNotes = [newNote, ...prevNotes];
      return updatedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.dateModified) - new Date(a.dateModified);
      });
    });
    onNoteSelect(newNote.id);
  };

  const sortNotes = (notesToSort) => {
    return notesToSort.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.dateModified) - new Date(a.dateModified);
    });
  };

  const updateNote = (id, updates, updateModified) => {
    console.log("id:", id)
    console.log("updates:", updates)
    console.log("modified:", updateModified)
    setNotes(prevNotes => {
      const updatedNotes = prevNotes.map(note => 
        note.id === id 
          ? { 
              ...note, 
              ...updates,
              dateModified: updateModified ? new Date().toISOString() : note.dateModified 
            }
          : note
      );
      return updateModified ? sortNotes(updatedNotes) : updatedNotes;
    });
  };
  

  const handleContextMenu = (e, noteId) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      noteId
    });
  };

  const filteredNotes = notes.filter(note => {
    const noteContent = note.content.toLowerCase();
    return noteContent.includes(searchTerm.toLowerCase());
  });

  return (
    <>
      <div className="sidebar" id="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <img src={logo} alt="biz logo" width="50" height="50" />
            <h1>peridot.</h1>
          </div>
          <div className="search">
            <input
              type="search"
              id="note-search"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button 
              type="button" 
              className="new-note-btn"
              onClick={createNewNote}
              title="New Note"
            >
              <SquarePen />
            </button>
          </div>
        </div>
        <ul className="note-list">
          {filteredNotes.map(note => (
            <li
              key={note.id}
              className={`note-item ${note.id === selectedId ? 'active' : ''}`}
              onClick={() => onNoteSelect(note.id)}
              onContextMenu={(e) => handleContextMenu(e, note.id)}
            >
              <div className="note-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span className="note-title">
                    {getFirstLine(note.content) || 'Untitled'}
                  </span>
                  <div className="note-preview">
                    {note.locked ? 'Unlock to view' : getPreviewContent(note.content)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  {note.pinned && <Pin size={20} className="pin-indicator" />}
                  {note.locked && <Lock size={20} className="lock-indicator" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <MainContent 
        note={notes.find(note => note.id === selectedId)} 
        onUpdateNote={(updates, updateModified = true) => {
          setNotes(prevNotes => {
            const updatedNotes = prevNotes.map(note => 
              note.id === selectedId 
                ? { 
                    ...note, 
                    ...updates,
                    dateModified: updateModified ? new Date().toISOString() : note.dateModified 
                  }
                : note
            );
            return updateModified ? sortNotes(updatedNotes) : updatedNotes;
          });
        }}
        onUnlockNote={onUnlockNote}
      />
      {contextMenu && (
        <InfoMenu
          selectedId={contextMenu.noteId}
          notes={notes}
          onTogglePin={onTogglePin}
          onDeleteNote={onDeleteNote}
          onLockModalOpen={onLockModalOpen}
          onUnlockModalOpen={onUnlockModalOpen}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

export default Sidebar;