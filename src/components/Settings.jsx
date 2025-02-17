import React, { useState, useEffect, useRef } from 'react';
import { Modal, ItemPresets, ItemComponents } from './Modal';
import { storageService } from '../utils/StorageService';
import { Sun, Moon, Bug, Save, Trash2, Upload, Monitor } from 'lucide-react';
import { passwordStorage } from '../utils/PasswordStorageService';
import { noteImportExportService } from '../utils/NoteImportExportService';
import { noteSortingService } from '../utils/NoteSortingService';
import { ZipImportHandler } from '../utils/ZipImportHandler';
import StorageAnalyzer from './StorageAnalyzer';
import StorageDiagnostics from './StorageDiagnostics';
import StorageBar from './StorageBar';
import ResponsiveModal from './ResponsiveModal';


function Settings({ isOpen, onClose, setNotes, onNoteSelect }) {
  const fileInputRef = useRef(null);
  const [theme, setTheme] = useState('system');
  const [fileType, setFileType] = useState(() => localStorage.getItem('preferredFileType') || 'json');
  const [currentStorageType, setCurrentStorageType] = useState(storageService.getCurrentStorageType());
  const [availableStorageTypes, setAvailableStorageTypes] = useState([]);

  useEffect(() => {
    setAvailableStorageTypes(storageService.getAvailableStorageTypes());
  }, []);

  const handleStorageTypeChange = async (type) => {
    try {
      await storageService.setPreferredStorage(type);
      setCurrentStorageType(type);
      // Reload all notes since storage type changed
      const savedNotes = await storageService.getAllNotes();
      setNotes(noteSortingService.sortNotes(savedNotes));
    } catch (error) {
      alert(`Failed to change storage type: ${error.message}`);
    }
  };

  const [prioritizePinned, setPrioritizePinned] = useState(() => 
  localStorage.getItem('prioritizePinned') === 'true'
  );
  
  const [jsonAsEncrypted, setJsonAsEncrypted] = useState(() => 
    localStorage.getItem('jsonAsEncrypted') === 'true'
  );

  const [skipPasswordVerification, setSkipPasswordVerification] = useState(() =>
    localStorage.getItem('skipPasswordVerification') === 'true'
  );

  // const [autoCollapseLockedFolders, setAutoCollapseLockedFolders] = useState(() => 
  //   localStorage.getItem('autoCollapseLockedFolders') !== 'false'
  // );

  const handleEncryptedJsonChange = (event) => {
    const newValue = event.target.checked;
    setJsonAsEncrypted(newValue);
    localStorage.setItem('jsonAsEncrypted', newValue);
  };

  const handleSkipPasswordVerificationChange = (event) => {
    const newValue = event.target.checked;
    setSkipPasswordVerification(newValue);
    localStorage.setItem('skipPasswordVerification', newValue);
  }


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
      const files = Array.from(event.target.files);
      
      // Separate ZIP files from other files
      const zipFiles = files.filter(file => 
        file.type === 'application/zip' || 
        file.type === 'application/x-zip-compressed' ||
        file.name.toLowerCase().endsWith('.zip')
      );
      const otherFiles = files.filter(file => !zipFiles.includes(file));
      
      let totalImported = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
  
      // Handle regular files first
      if (otherFiles.length > 0) {
        const results = await noteImportExportService.importNotes(otherFiles, {
          openLastImported: true,
          setSelectedId: onNoteSelect,
          setNotes,
          onError: (error, filename) => {
            console.error(`Error importing ${filename}:`, error);
          }
        });
  
        totalImported += results.successful.length;
        totalSkipped += results.skipped.length;
        totalFailed += results.failed.length;
      }
  
      // Handle ZIP files
      for (const zipFile of zipFiles) {
        try {
          const { ZipImportHandler } = await import('../utils/ZipImportHandler');
          const result = await ZipImportHandler.importZip(zipFile, {
            setNotes,
            onNoteSelect
          });
          
          if (result.success) {
            totalImported += result.imported;
          }
        } catch (error) {
          console.error(`Failed to import ZIP file ${zipFile.name}:`, error);
          totalFailed++;
        }
      }
  
      // Construct user feedback message
      let message = [];
      if (totalImported > 0) {
        message.push(`Successfully imported ${totalImported} items`);
      }
      if (totalSkipped > 0) {
        message.push(`\nSkipped ${totalSkipped} invalid items`);
      }
      if (totalFailed > 0) {
        message.push(`\nFailed to import ${totalFailed} files`);
      }
  
      if (message.length > 0) {
        alert(message.join(''));
      } else {
        alert('No valid files were found to import');
      }
  
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Failed to import files: ${error.message}`);
      
      // Reset file input on error
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleForceClean = async () => {
    if (window.confirm('WARNING: This will completely clear all OPFS storage. This cannot be undone. Continue?')) {
      try {
        await storageService.forceCleanStorage();
        setNotes([]); // Clear notes from state
        alert('Storage cleared successfully. Please refresh the page.');
      } catch (error) {
        console.error('Failed to clear storage:', error);
        alert('Failed to clear storage: ' + error.message);
      }
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
        // {
        //   content: 
        //   <ItemPresets.SUBSECTION title="Folders">
        //     <ItemPresets.TEXT_SWITCH
        //       label="Auto-collapse locked folders"
        //       subtext="Automatically collapse locked folders when page refreshes"
        //       value={autoCollapseLockedFolders}
        //       onChange={(e) => {
        //         const newValue = e.target.checked;
        //         setAutoCollapseLockedFolders(newValue);
        //         localStorage.setItem('autoCollapseLockedFolders', newValue);
        //       }}
        //     />
        //   </ItemPresets.SUBSECTION>
        // },
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
              accept=".json, .md, .txt, .zip"
              onChange={handleImportNotes}
            />
          </ItemPresets.SUBSECTION>
        },
        {
          content: <ItemPresets.SUBSECTION title="Storage">
            <ItemPresets.TEXT_DROPDOWN
              label="Storage Method"
              subtext={`Current: ${currentStorageType || 'Automatic'}`}
              value={currentStorageType}
              options={availableStorageTypes}
              onChange={handleStorageTypeChange}
            />
            <ItemComponents.TEXT
              label=""
              subtext="Changes to storage method will take effect immediately. Your notes will be migrated to the new storage type."
            />
          </ItemPresets.SUBSECTION>
        },
        {
          content: <ItemPresets.SUBSECTION title="Security">
            <ItemPresets.TEXT_SWITCH
              label="Disable internal password confirmation"
              subtext="If enabled, the system will not verify that their password matches the internal stored password before trying to decrypt the note"
              value={skipPasswordVerification}
              onChange={handleSkipPasswordVerificationChange}
            />
          </ItemPresets.SUBSECTION>
        },
        {
            content: <ItemPresets.SUBSECTION title="Storage Information">
              <StorageAnalyzer />
            </ItemPresets.SUBSECTION>
        },
        {
          content:
          <ItemComponents.SUBSECTION title={"OPFS"}>
          <ItemPresets.SUBSECTION title="Storage Information">
            <ItemPresets.TEXT_BUTTON
              label="Check Storage Usage"
              subtext={<StorageBar />}
              buttonText="Check Usage"
              onClick={async () => {
                try {
                  await storageService.checkStorageEstimate();
                } catch (error) {
                  alert(`Failed to check storage: ${error.message}`);
                }
              }}
              />
            
            <StorageDiagnostics />
          </ItemPresets.SUBSECTION>
          </ItemComponents.SUBSECTION>
        },
        {
          content: 
          <ItemPresets.SUBSECTION title="Drastic Measures">
            <ItemPresets.TEXT_BUTTON
              label="Force Clean Storage"
              subtext="WARNING: This will completely clear all OPFS data"
              buttonText="Force Clean"
              primary="warning"
              onClick={handleForceClean}
            />
          </ItemPresets.SUBSECTION>
        },
      ]
    }
  ];
  
  if (!isOpen) return null;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      sections={settingsSections}
      size="large"
    />
  );
}

export default Settings;