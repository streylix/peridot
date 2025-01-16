// components/Sidebar.jsx
import React, { useState, useEffect } from 'react';
import MainContent from './MainContent';
import logo from '../assets/logo.png';

function Sidebar({ selectedId, onNoteSelect }) {
  const [notes, setNotes] = useState(() => {
    const savedNotes = localStorage.getItem('notes');
    return savedNotes ? JSON.parse(savedNotes) : [];
  });
  
  const [searchTerm, setSearchTerm] = useState('');

  // Save notes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notes', JSON.stringify(notes));
  }, [notes]);

  const createNewNote = () => {
    const newNote = {
      id: Date.now(),
      title: getUniqueTitle(),
      content: '',
      dateModified: new Date().toISOString(),
      pinned: false
    };

    setNotes(prevNotes => {
      const updatedNotes = [newNote, ...prevNotes];
      return sortNotes(updatedNotes);
    });
    onNoteSelect(newNote.id);
  };

  const getUniqueTitle = () => {
    let counter = 1;
    let title = 'New Note';
    while (notes.some(note => note.title === title)) {
      title = `New Note ${counter}`;
      counter++;
    }
    return title;
  };

  const sortNotes = (notesToSort) => {
    return notesToSort.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.dateModified) - new Date(a.dateModified);
    });
  };

  const updateNote = (id, updates) => {
    setNotes(prevNotes => {
      const updatedNotes = prevNotes.map(note => 
        note.id === id 
          ? { 
              ...note, 
              ...updates, 
              dateModified: new Date().toISOString() 
            }
          : note
      );
      return sortNotes(updatedNotes);
    });
  };

  const togglePin = (id) => {
    const note = notes.find(n => n.id === id);
    updateNote(id, { pinned: !note.pinned });
  };

  const deleteNote = (id) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      setNotes(prevNotes => {
        const filteredNotes = prevNotes.filter(note => note.id !== id);
        return sortNotes(filteredNotes);
      });
      
      if (id === selectedId) {
        onNoteSelect(null);
      }
    }
  };

  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            ✚
          </button>
        </div>

        <ul className="note-list">
        {filteredNotes.map(note => (
          <li
            key={note.id}
            className={`note-item ${note.id === selectedId ? 'active' : ''}`}
            onClick={() => onNoteSelect(note.id)}
          >
            {note.pinned && <span className="pin-indicator">📌</span>}
            <span className="note-title">{note.title}</span>
            <button
              className="pin-button"
              onClick={(e) => {
                e.stopPropagation();
                togglePin(note.id);
              }}
            >
              {note.pinned ? '📌' : '📍'}
            </button>
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