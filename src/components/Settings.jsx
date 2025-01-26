import React, { useState, useEffect, useRef } from 'react';
import { Modal, ItemPresets, ItemComponents } from './Modal';
import { Sun, Moon, Bug, Save, Trash2, Upload } from 'lucide-react';

function Settings({ isOpen, onClose, setNotes }) {
  const fileInputRef = useRef(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const handleClearNotes = () => {
    if (window.confirm('Are you sure? This will delete all notes.')) {
      localStorage.removeItem('notes');
      setNotes([]);
    }
  };

  const handleSaveNotes = () => {
    const notes = localStorage.getItem('notes');
    const blob = new Blob([notes], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notes_backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateUniqueId = (() => {
    let counter = 0;
    return () => Date.now() + counter++;
  })();

  const normalizeNote = (note) => {
    if (!note.content) return null;

    const normalized = {
      id: generateUniqueId(),
      content: note.content,
      dateModified: note.dateModified || new Date().toISOString(),
      pinned: Boolean(note.pinned),
      caretPosition: Number(note.caretPosition) || 0,
      originalId: note.id
    };

    if (typeof note.id === 'number') {
      normalized.originalId = note.id;
    }

    return normalized;
  };

  const handleImportNotes = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedNotes = JSON.parse(text);
      
      if (!Array.isArray(importedNotes)) {
        throw new Error('Invalid format: Expected an array of notes');
      }

      const validNotes = importedNotes
        .map(note => normalizeNote(note))
        .filter(Boolean);

      if (validNotes.length === 0) {
        throw new Error('No valid notes found in import file');
      }

      const existingNotesStr = localStorage.getItem('notes');
      const existingNotes = existingNotesStr ? JSON.parse(existingNotesStr) : [];
      
      const mergedNotes = [...existingNotes, ...validNotes];

      const sortedNotes = mergedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.dateModified) - new Date(a.dateModified);
      });

      localStorage.setItem('notes', JSON.stringify(sortedNotes));
      setNotes(sortedNotes);
      
      const skippedCount = importedNotes.length - validNotes.length;
      if (skippedCount > 0) {
        alert(`Import completed with warnings:\n${skippedCount} invalid notes were skipped.`);
      } else {
        alert('Import completed successfully!');
      }
    } catch (error) {
      console.error('Error importing notes:', error);
      alert(`Error importing notes: ${error.message}`);
    }
  };

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  if (!isOpen) return null;

  const settingsSections = [
    {
      label: 'General',
      items: [
        {
          content: <ItemPresets.SUBSECTION title="Appearance">
            <ItemPresets.TEXT_SWITCH
              label="Dark Mode"
              subtext="Toggle between light and dark theme"
              value={isDarkMode}
              onChange={() => setIsDarkMode(prev => !prev)}
            />
          </ItemPresets.SUBSECTION>
        }
      ]
    },
    {
      label: 'Developer',
      items: [
        {
          content: <ItemPresets.SUBSECTION title="Debug">
            <ItemPresets.TEXT_BUTTON
              label="Backup Notes"
              subtext="Download all notes as a JSON file"
              buttonText="Backup"
              primary="primary"
              onClick={handleSaveNotes}
            />
            <ItemPresets.TEXT_BUTTON
              label="Import Notes"
              subtext="Import notes from a backup JSON file"
              buttonText="Import"
              onClick={() => fileInputRef.current?.click()}
            />
            <ItemPresets.TEXT_BUTTON
              label="Note Cleanup"
              subtext="Clears all notes from the sidebar (CANNOT BE UNDONE)"
              buttonText="Clear Notes"
              primary="warning"
              onClick={handleClearNotes}
            />
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".json"
              onChange={handleImportNotes}
            />
          </ItemPresets.SUBSECTION>
        }
      ]
    }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      {...{
        title: "Settings",
        sections: settingsSections,
        size: "large"
      }}
    />
  );
}

export default Settings;