import React, { useState } from 'react';
import { SquarePen, Pin } from 'lucide-react'
import MainContent from './MainContent';
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

function Sidebar({ selectedId, onNoteSelect, notes, setNotes }) {
  const [searchTerm, setSearchTerm] = useState('');

  const createNewNote = () => {
    const newNote = {
      id: Date.now(),
      title: '',
      content: '',
      dateModified: new Date().toISOString(),
      pinned: false
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

  const updateNote = (id, updates) => {
    setNotes(prevNotes => {
      const updatedNotes = prevNotes.map(note => 
        note.id === id 
          ? { 
              ...note, 
              ...updates, 
              title: getFirstLine(updates.content || note.content),
              dateModified: new Date().toISOString() 
            }
          : note
      );
      return updatedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.dateModified) - new Date(a.dateModified);
      });
    });
  };

  const deleteNote = (id) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      setNotes(prevNotes => {
        const filteredNotes = prevNotes.filter(note => note.id !== id);
        return filteredNotes;
      });
      
      if (id === selectedId) {
        onNoteSelect(null);
      }
    }
  };

  const filteredNotes = notes.filter(note => {
    const noteContent = note.content.toLowerCase();
    return noteContent.includes(searchTerm.toLowerCase());
  });

  const selectedNote = notes.find(note => note.id === selectedId);

  return (
    <>
      <div className="sidebar" id="sidebar">
        <div className="logo">
          <img src={logo} alt="biz logo" width="50" height="50"></img>
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

        <ul className="note-list">
          {filteredNotes.map(note => (
            <li
              key={note.id}
              className={`note-item ${note.id === selectedId ? 'active' : ''}`}
              onClick={() => onNoteSelect(note.id)}
            >
              <div className="note-header">
                <span className="note-title">
                  {getFirstLine(note.content) || 'Untitled'}
                </span>
                {note.pinned && (
                  <div className="pin-indicator">
                    <Pin size={20}className="h-4 w-4 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="note-preview">
                {getPreviewContent(note.content)}
              </div>
            </li>
          ))}
        </ul>

        <button 
          type="button" 
          id="debug-button"
          onClick={() => {
            if (window.confirm('Are you sure? This will delete all notes.')) {
              setNotes([]);
              localStorage.removeItem('notes');
              onNoteSelect(null);
            }
          }}
        >
          Clear All Notes (Debug)
        </button>
      </div>
      <MainContent 
        note={selectedNote} 
        onUpdateNote={(updates) => updateNote(selectedId, updates)} 
      />
    </>
  );
}

export default Sidebar;