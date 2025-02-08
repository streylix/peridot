import JSZip from 'jszip';
import { storageService } from './StorageService';
import { noteSortingService } from './NoteSortingService';

export class ZipImportHandler {
  static async processZipFile(file) {

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);

      const importedNotes = [];

      await this.processZipEntries(zipContent.files, '', importedNotes);

      return importedNotes;
    } catch (error) {
      console.error('DETAILED Error processing ZIP file:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  static async processZipEntries(entries, parentPath, importedNotes) {
  
    const folders = new Map();
    const files = [];
  
    // First pass: Create folder structure
    for (const [path, entry] of Object.entries(entries)) {
      try {
        if (entry.dir) {
          const folderPath = path.replace(/\/$/, '');
          const folderName = folderPath.split('/').pop() || 'Untitled Folder';
  
          const folder = {
            id: this.generateUniqueIdFromDate(entry.date),
            type: 'folder',
            content: `<div>${folderName}</div>`,
            dateModified: entry.date ? entry.date.toISOString() : new Date().toISOString(),
            pinned: false,
            locked: false,
            isOpen: true,
            parentFolderId: null
          };
  
          folders.set(folderPath, folder);
          importedNotes.push(folder);
        } else {
          files.push({ path, entry });
        }
      } catch (entryError) {
        console.error('Error processing entry:', {
          path,
          error: entryError.message
        });
      }
    }
  
    // Second pass: Process files and link to folders
    for (const { path, entry } of files) {
      try {
        const content = await entry.async('string');
        const fileName = path.split('/').pop() || 'Untitled';
        const parentFolder = path.split('/').slice(0, -1).join('/');
        const fileExt = fileName.split('.').pop().toLowerCase();
  
        let note;
  
        // Handle different file types
        switch (fileExt) {
          case 'json':
            try {
              const parsedContent = JSON.parse(content);
              
              // Handle both single note and array of notes
              const notesToProcess = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
              
              for (const item of notesToProcess) {
                note = {
                  id: item.id || this.generateUniqueIdFromDate(entry.date),
                  content: item.content || content,
                  dateModified: item.dateModified || (entry.date ? entry.date.toISOString() : new Date().toISOString()),
                  dateCreated: item.dateCreated || item.id || (entry.date ? entry.date.toISOString() : new Date().toISOString()),
                  pinned: item.pinned || false,
                  caretPosition: item.caretPosition || 0,
                  parentFolderId: folders.get(parentFolder)?.id || null,
                  locked: item.locked || false,
                  encrypted: item.encrypted || false
                };
  
                // Preserve encrypted note properties
                if (item.encrypted) {
                  note.keyParams = item.keyParams;
                  note.iv = item.iv;
                  note.visibleTitle = item.visibleTitle;
                }
  
                importedNotes.push(note);
              }
            } catch (jsonError) {
              console.error('Error parsing JSON:', {
                fileName,
                error: jsonError.message
              });
              // Fallback: treat as raw content
              note = {
                id: this.generateUniqueIdFromDate(entry.date),
                content: this.formatFileContent(content, fileName, fileExt),
                dateModified: entry.date ? entry.date.toISOString() : new Date().toISOString(),
                dateCreated: entry.date ? entry.date.toISOString() : new Date().toISOString(),
                pinned: false,
                caretPosition: 0,
                parentFolderId: folders.get(parentFolder)?.id || null
              };
              importedNotes.push(note);
            }
            break;
  
          case 'md':
          case 'txt':
            note = {
              id: this.generateUniqueIdFromDate(entry.date),
              content: this.formatFileContent(content, fileName, fileExt),
              dateModified: entry.date ? entry.date.toISOString() : new Date().toISOString(),
              dateCreated: entry.date ? entry.date.toISOString() : new Date().toISOString(),
              pinned: false,
              caretPosition: 0,
              parentFolderId: folders.get(parentFolder)?.id || null
            };
            importedNotes.push(note);
            break;
  
          default:
            // Handle other file types as plain text
            note = {
              id: this.generateUniqueIdFromDate(entry.date),
              content: this.formatFileContent(content, fileName, 'txt'),
              dateModified: entry.date ? entry.date.toISOString() : new Date().toISOString(),
              dateCreated: entry.date ? entry.date.toISOString() : new Date().toISOString(),
              pinned: false,
              caretPosition: 0,
              parentFolderId: folders.get(parentFolder)?.id || null
            };
            importedNotes.push(note);
        }
      } catch (fileError) {
        console.error('Error processing file:', {
          path,
          error: fileError.message
        });
      }
    }
  
    // Third pass: Link folders to their parents
    for (const [path, folder] of folders) {
      const parentPath = path.split('/').slice(0, -1).join('/');
      if (parentPath && folders.has(parentPath)) {
        folder.parentFolderId = folders.get(parentPath).id;
      }
    }
  
    return importedNotes;
  }

  // Generate a unique ID based on the file's date, with a tiny random offset to prevent conflicts
  static generateUniqueIdFromDate(date) {
    if (!date) return Date.now();
    
    // Use the date's timestamp and add a small random offset
    return date.getTime() + Math.floor(Math.random() * 1000);
  }

  static formatFileContent(content, fileName, fileExt) {
    // Remove file extension
    const title = fileName.replace(/\.[^/.]+$/, '');
    
    // Format content as HTML
    let formattedContent = `<div>${title}</div>`;
    
    // Special handling for markdown
    if (fileExt === 'md') {
      // Replace markdown links and images
      content = content.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
      content = content.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    }
    
    // Split content into lines and wrap each in a div
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.trim().length > 0) {
        formattedContent += `<div>${line}</div>`;
      } else {
        formattedContent += `<div><br></div>`;
      }
    });
    
    return formattedContent;
  }

  static isZipFile(file) {
    return file.type === 'application/zip' || 
           file.type === 'application/x-zip-compressed' ||
           file.name.toLowerCase().endsWith('.zip');
  }

  static async importZip(file, { setNotes, onNoteSelect }) {

    try {
      const importedNotes = await this.processZipFile(file);
      

      // Save all imported notes
      await Promise.all(importedNotes.map(note => {
        return storageService.writeNote(note.id, note);
      }));

      // Update notes list
      const allNotes = await storageService.getAllNotes();
      
      // Sort notes before setting
      const sortedNotes = noteSortingService.sortNotes(allNotes);
      setNotes(sortedNotes);

      // Select the first note if available
      const firstNote = importedNotes.find(note => !note.type);
      if (firstNote && onNoteSelect) {
        onNoteSelect(firstNote.id);
      }

      return {
        success: true,
        imported: importedNotes.length
      };
    } catch (error) {
      console.error('FINAL Import Error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }
}