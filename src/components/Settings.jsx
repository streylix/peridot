import React, { useState, useEffect, useRef } from 'react';
import { Modal, ItemPresets, ItemComponents } from './Modal';
import { Sun, Moon, Bug, Save, Trash2, Upload, Monitor } from 'lucide-react';

function Settings({ isOpen, onClose, setNotes }) {
  const fileInputRef = useRef(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'system';
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
    a.download = `notes_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateUniqueId = (() => {
    let counter = 0;
    return () => Date.now() + counter++;
  })();

  const normalizeNote = (note, existingNotes) => {
    if (!note.content) return null;

    const normalized = {
      content: note.content,
      dateModified: note.dateModified || new Date().toISOString(),
      pinned: Boolean(note.pinned),
      caretPosition: Number(note.caretPosition) || 0,
      locked: Boolean(note.locked)
    };

    // Only include tempPass if the note is locked
    if (normalized.locked && note.tempPass) {
      normalized.tempPass = note.tempPass;
    }

    // Keep original ID if it's a number and not already taken
    if (typeof note.id === 'number' && !existingNotes.some(n => n.id === note.id)) {
      normalized.id = note.id;
    } else {
      normalized.id = generateUniqueId();
      normalized.originalId = note.id; // Store original ID if needed
    }

    return normalized;
  };

  const handleImportNotes = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedData = JSON.parse(text);
      
      // Get existing notes
      const existingNotesStr = localStorage.getItem('notes');
      const existingNotes = existingNotesStr ? JSON.parse(existingNotesStr) : [];

      // Handle both single note and array of notes
      const notesToProcess = Array.isArray(importedData) ? importedData : [importedData];
      
      // Validate that we have note-like objects
      if (!notesToProcess.every(note => typeof note === 'object' && note !== null && 'content' in note)) {
        throw new Error('Invalid note format: Notes must have content');
      }

      const validNotes = notesToProcess
        .map(note => normalizeNote(note, existingNotes))
        .filter(Boolean);

      if (validNotes.length === 0) {
        throw new Error('No valid notes found in import file');
      }
      
      const mergedNotes = [...existingNotes, ...validNotes];

      // Sort notes by pinned status and date
      const sortedNotes = mergedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.dateModified) - new Date(a.dateModified);
      });

      localStorage.setItem('notes', JSON.stringify(sortedNotes));
      setNotes(sortedNotes);
      
      const skippedCount = notesToProcess.length - validNotes.length;
      if (skippedCount > 0) {
        alert(`Import completed with warnings:\n${skippedCount} invalid notes were skipped.`);
      } else {
        alert('Import completed successfully!');
      }
    } catch (error) {
      console.error('Error importing notes:', error);
      alert(`Error importing notes: ${error.message}`);
    }

    // Clear the file input for future imports
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addListener(handleChange);
    
    // Apply initial theme
    applyTheme(theme);

    return () => mediaQuery.removeListener(handleChange);
  }, [theme]);

  const applyTheme = (newTheme) => {
    if (newTheme === 'system') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.classList.toggle('dark-mode', prefersDark);
    } else {
      document.body.classList.toggle('dark-mode', newTheme === 'dark');
    }
    localStorage.setItem('theme', newTheme);
  };

  if (!isOpen) return null;

  const settingsSections = [
    {
      label: 'General',
      items: [
        {
          content: <ItemPresets.SUBSECTION title="Appearance">
            <ItemPresets.TEXT_DROPDOWN
              label="Theme"
              subtext="Choose your preferred appearance"
              value={theme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' }
              ]}
              onChange={(value) => {
                setTheme(value);
                applyTheme(value);
              }}
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
              label="Import Notes"
              subtext="Import notes from JSON file"
              buttonText="Import"
              onClick={() => fileInputRef.current?.click()}
            />
            <ItemPresets.TEXT_BUTTON
              label="Backup Notes"
              subtext="Download all notes as a JSON file"
              buttonText="Backup"
              primary="primary"
              onClick={handleSaveNotes}
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