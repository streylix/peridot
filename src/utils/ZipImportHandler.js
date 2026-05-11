import JSZip from 'jszip';
import { apiService } from './ApiService';
import { noteSortingService } from './NoteSortingService';
import { noteImportExportService } from './NoteImportExportService';

export class ZipImportHandler {
  static usedIds = new Set();

  static async processZipFile(file) {

    try {
      this.usedIds = new Set();
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
            content: folderName,
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
                  content: noteImportExportService.contentToMarkdown(item.content || content),
                  dateModified: item.dateModified || (entry.date ? entry.date.toISOString() : new Date().toISOString()),
                  dateCreated: item.dateCreated || item.id || (entry.date ? entry.date.toISOString() : new Date().toISOString()),
                  pinned: item.pinned || false,
                  caretPosition: item.caretPosition || 0,
                  parentFolderId: folders.get(parentFolder)?.id || null,
                  locked: false,
                  encrypted: false
                };
  
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

  // Generate a collision-checked ID based on the file's date.
  static generateUniqueIdFromDate(date) {
    const base = date ? date.getTime() : Date.now();
    let id = base;
    while (this.usedIds.has(id)) id += 1;
    this.usedIds.add(id);
    return id;
  }

  static formatFileContent(content, fileName, fileExt) {
    return fileExt === 'md' ? content : String(content);
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
        return apiService.writeNote(note.id, note);
      }));

      // Update notes list
      const allNotes = await apiService.getAllNotes();
      
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
