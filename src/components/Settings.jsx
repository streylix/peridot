import React, { useState, useEffect, useRef } from 'react';
import { Modal, ItemPresets } from './Modal';
import { storageService } from '../utils/StorageService';
import { Sun, Moon, Bug, Save, Trash2, Upload, Monitor } from 'lucide-react';
import { passwordStorage } from '../utils/PasswordStorageService';

function Settings({ isOpen, onClose, setNotes }) {
  const fileInputRef = useRef(null);
  const [theme, setTheme] = useState('system');
  const [fileType, setFileType] = useState(() => localStorage.getItem('preferredFileType') || 'json');

const handleFileTypeChange = (newType) => {
  console.log(`new type: ${newType}`)
  setFileType(newType);
  localStorage.setItem('preferredFileType', newType);
};

// Load theme
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await storageService.readThemePreference();
        setTheme(savedTheme);
        applyTheme(savedTheme);
      } catch (error) {
        console.error('Failed to load theme:', error);
      }
    };
    loadTheme();
  }, []);

  const applyTheme = async (newTheme) => {
    try {
      if (newTheme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-mode', prefersDark);
      } else {
        document.body.classList.toggle('dark-mode', newTheme === 'dark');
      }
      
      await storageService.writeThemePreference(newTheme);
      setTheme(newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  // Match system theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        document.body.classList.toggle('dark-mode', mediaQuery.matches);
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [theme]);

  const handleClearNotes = async () => {
    if (window.confirm('Are you sure? This will delete all notes.')) {
      try {
        await storageService.clearAllData();
        setNotes([]);
      } catch (error) {
        console.error('Failed to clear notes:', error);
      }
    }
  };

  const handleSaveNotes = async () => {
    try {
      const notes = await storageService.getAllNotes();
      const blob = new Blob([JSON.stringify(notes)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notes_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to save backup:', error);
    }
  };

  const handleImportNotes = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedData = JSON.parse(text);
      
      const notesToProcess = Array.isArray(importedData) ? importedData : [importedData];
      
      if (!notesToProcess.every(note => typeof note === 'object' && note !== null && 'content' in note)) {
        throw new Error('Invalid note format: Notes must have content');
      }

      for (const note of notesToProcess) {
        if (note.id && note.content) {
          await storageService.writeNote(note.id, {
            ...note,
            dateModified: note.dateModified || new Date().toISOString(),
            pinned: Boolean(note.pinned),
            caretPosition: Number(note.caretPosition) || 0
          });
        }
      }

      const updatedNotes = await storageService.getAllNotes();
      setNotes(updatedNotes);

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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
              onChange={applyTheme}
            />
          </ItemPresets.SUBSECTION>
        },
        {
          content: <ItemPresets.SUBSECTION title="Download">
            <ItemPresets.TEXT_DROPDOWN
              label="Saved File Type"
              subtext="Note: Some attributes may be lost when using formats other than JSON"
              value={fileType}
              options={[
                { value: 'json', label: 'JSON (.json)' },
                { value: 'markdown', label: 'Markdown (.md)' },
                { value: 'text', label: 'Plain Text (.txt)' },
                { value: 'pdf', label: 'PDF Document (.pdf)' }
              ]}
              onChange={(type) => {
                handleFileTypeChange(type);
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

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      sections={settingsSections}
      size="large"
    />
  );
}

export default Settings;