import React, { useState, useEffect, useRef } from 'react';
import { Modal, ItemPresets } from './Modal';
import { storageService } from '../utils/StorageService';
import { Sun, Moon, Bug, Save, Trash2, Upload, Monitor } from 'lucide-react';
import { passwordStorage } from '../utils/PasswordStorageService';
import { noteImportExportService } from '../utils/NoteImportExportService';
import { noteSortingService } from '../utils/NoteSortingService';

function Settings({ isOpen, onClose, setNotes, onNoteSelect }) {
  const fileInputRef = useRef(null);
  const [theme, setTheme] = useState('system');
  const [fileType, setFileType] = useState(() => localStorage.getItem('preferredFileType') || 'json');

  const [prioritizePinned, setPrioritizePinned] = useState(() => 
  localStorage.getItem('prioritizePinned') === 'true'
  );
  
  const [jsonAsEncrypted, setJsonAsEncrypted] = useState(() => 
    localStorage.getItem('jsonAsEncrypted') === 'true'
  );

  const handleEncryptedJsonChange = (event) => {
    const newValue = event.target.checked;
    setJsonAsEncrypted(newValue);
    localStorage.setItem('jsonAsEncrypted', newValue);
  };


  const handleFileTypeChange = (newType) => {
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
      console.log("Downloading from handleSaveNotes in Settings.jsx")
      await noteImportExportService.downloadNote({
        note: notes,
        fileType: 'json',
        isBackup: true
      });
    } catch (error) {
      console.error('Failed to save backup:', error);
    }
  };

  const handleImportNotes = async (event) => {
    try {
      const results = await noteImportExportService.importNotes(event.target.files, {
        openLastImported: true,
        setSelectedId: onNoteSelect,
        setNotes: setNotes,
        onError: (error, filename) => {
          console.error(`Error importing ${filename}:`, error);
        }
      });
  
      // Construct user feedback message
      let message = [];
      if (results.successful.length > 0) {
        message.push(`Successfully imported ${results.successful.length} notes`);
      }
      if (results.skipped.length > 0) {
        message.push(`\nSkipped ${results.skipped.length} invalid notes`);
      }
      if (results.failed.length > 0) {
        message.push(`\nFailed to import ${results.failed.length} files`);
      }
  
      alert(message.join(''));
  
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Failed to import notes: ${error.message}`);
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
          content: 
          <ItemPresets.SUBSECTION title="Filter & Sort">
            <ItemPresets.TEXT_SWITCH
              label="Prioritize pinned notes"
              subtext="Keep pinned notes at top regardless of sort order (Always active when sorting by Date Modified)"
              value={prioritizePinned}
              onChange={(e) => {
                const newValue = e.target.checked;
                setPrioritizePinned(newValue);
                noteSortingService.setPrioritizePinned(newValue);
                const currentMethod = noteSortingService.getSortMethod();
                setNotes(prevNotes => [...noteSortingService.sortNotes(prevNotes, currentMethod)]);
              }}
            />
          </ItemPresets.SUBSECTION>
        },
        {
          content: <ItemPresets.SUBSECTION title="Download">
            <ItemPresets.TEXT_SWITCH
              label="Download JSON as encrypted"
              subtext="When enabled, locked notes downloaded to JSON will remain in their encrypted state"
              value={jsonAsEncrypted}
              onChange={handleEncryptedJsonChange}
            />
            <ItemPresets.TEXT_DROPDOWN
              label="Saved File Type"
              subtext="Note: Some attributes may be lost when using formats other than JSON"
              value={fileType}
              options={[
                { value: 'json', label: 'JSON (.json)' },
                { value: 'md', label: 'Markdown (.md)' },
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
              accept=".json, .md, .txt"
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