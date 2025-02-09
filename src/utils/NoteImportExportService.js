import { storageService } from './StorageService';
import { noteContentService } from './NoteContentService';
import { passwordStorage } from './PasswordStorageService';
import html2pdf from 'html2pdf.js';

class NoteImportExportService {
  constructor() {
    this.supportedImportTypes = {
      'application/json': this.handleJsonImport.bind(this),
      'text/markdown': this.handleMarkdownImport.bind(this),
      'text/x-markdown': this.handleMarkdownImport.bind(this),
      'text/plain': this.handleTextImport.bind(this)
    };
  }

  /**
   * Get appropriate filename for note download
   * @private
   */
  getDownloadFilename(note, fileType, isEncrypted = false) {
    let title;
    if (isEncrypted) {
      // For encrypted notes, use visibleTitle or a default name
      title = note.visibleTitle || 'encrypted-note';
    } else {
      title = noteContentService.getFirstLine(note.content);
    }
    
    // Sanitize filename
    title = title.replace(/[^\w\s-]/g, '').trim();
    if (!title) title = 'untitled';
    
    return `${title}.${fileType}`;
  }

  jsonToText(content) {
    content = content.replace(/<\/div>/gi, '\n');
    content = content.replace(/<br\s*\/?>/gi, '');
    let lines = content.split('\n');
    lines.shift();
    content = lines.join('\n');
    content = content.replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)".*?>/gi, '\n\n![$2]($1)\n\n');
    content = content.replace(/<\/?div>/gi, '');
    return content;
  }

  processContentForPdf(htmlContent) {
    let content = htmlContent;
    content = content.replace(/<\/div>/gi, '\n');
    content = content.replace(/<br\s*\/?>/gi, '');
    content = content.replace(/<\/?div>/gi, '');

    const images = [];
    let imgCount = 0;
    content = content.replace(/<img[^>]+>/gi, match => {
      images[imgCount] = match;
      return `__IMG${imgCount++}__`;
    });

    content = content.replace(/<[^>]+>/g, '');

    images.forEach((img, i) => {
      content = content.replace(`__IMG${i}__`, img);
    });

    return content;
  }

  createPdfContent(note, includeTitle = true) {
    const jsonToText = (content) => {
      
        content = content.replace(/<\/div>/gi, '\n');
        content = content.replace(/<br\s*\/?>/gi, '');
      
        let lines = content.split('\n');
        lines.shift(); // Remove the first line
      
        content = lines.join('\n');
      
        // Replace <img> tags with Markdown image syntax and remove style attributes
        content = content.replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)".*?>/gi, '\n\n![$2]($1)\n\n');
      
        // Remove <div> tags but keep their content
        content = content.replace(/<\/?div>/gi, '');
      
        return content;
      };

    const container = document.createElement('div');

    if (includeTitle) {
      const titleText = noteContentService.getFirstLine(note.content);
      const headerContainer = document.createElement('div');
      headerContainer.style.cssText = 'margin-bottom: 12px;';

      const titleElement = document.createElement('div');
      titleElement.textContent = titleText;
      titleElement.style.cssText = 'font-size: 32px; font-weight: bold; color: #000000;';

      headerContainer.appendChild(titleElement);
      container.appendChild(headerContainer);
    }

    const processedContent = this.processContentForPdf(note.content);
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = 'font-size: 16px; color: #000000;';

    const paragraphs = processedContent.split('\n');
    paragraphs.shift();
    
    paragraphs.forEach(para => {
      if (para.includes('<img')) {
        const imgDiv = document.createElement('div');
        imgDiv.innerHTML = para;
        Array.from(imgDiv.getElementsByTagName('img')).forEach(img => {
          img.style.cssText = 'max-width: 100%; height: auto; margin: 16px 0; display: block;';
          img.crossOrigin = 'anonymous';
        });
        contentContainer.appendChild(imgDiv);
      } else if (para) {
        const p = document.createElement('div');
        p.textContent = para;
        contentContainer.appendChild(p);
      } else if (!para) {
        contentContainer.appendChild(document.createElement('br'));
      }
    });

    container.appendChild(contentContainer);
    return container;
  }

  getFileTypeInfo(fileType) {
    const types = {
      json: { mimeType: 'application/json', extension: 'json' },
      md: { mimeType: 'text/md', extension: 'md' },
      text: { mimeType: 'text/plain', extension: 'txt' },
      pdf: { mimeType: 'application/pdf', extension: 'pdf' }
    };
    return types[fileType] || types.json;
  }

  /**
   * Universal download handler for all note download scenarios
   * @param {Object} options - Download options
   * @param {Object|Object[]} options.note - Note or array of notes to download
   * @param {string} options.fileType - Type of file to download (json, markdown, text, pdf)
   * @param {boolean} options.isEncrypted - Whether the note is encrypted
   * @param {string} [options.password] - Password for encrypted notes
   * @param {Object} [options.pdfSettings] - PDF export settings
   * @param {Function} [options.onPdfExport] - Callback to handle PDF export modal
   * @param {boolean} [options.isBackup] - Whether this is a backup export
   */
  async downloadNote({
    note,
    fileType = 'json',
    isEncrypted = false,
    password = null,
    pdfSettings = null,
    onPdfExport = null,
    isBackup = false
  }) {
    try {
      console.log("first")
      // Handle backup case (multiple notes)
      if (Array.isArray(note)) {
        if (fileType !== 'json') {
          throw new Error('Backup currently is only supported for JSON format');
        }
        const blob = new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
  
        // If it's a backup from settings, use backup naming
        // Otherwise, use the folder name
        let fileName;
        if (isBackup) {
          fileName = `notes_backup_${new Date().toISOString().split('T')[0]}.json`;
        } else {
          // Find the folder (should be first item in array)
          const folder = note.find(item => item.type === 'folder');
          const folderName = folder ? 
            (folder.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'folder') : 
            'folder';
          fileName = `${folderName}.json`;
        }
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
  
      if (!note) return;
  
      // Handle single note download
      let noteToExport = note;
      let keepEncrypted = false;
      console.log("second")
      // Handle encrypted notes
      if (isEncrypted && password) {
        if (!password) {
          throw new Error('Password required for encrypted note');
        }

        // For JSON, check if we should keep encryption
        if (fileType === 'json' && localStorage.getItem('jsonAsEncrypted') === 'true') {
          keepEncrypted = true;
          noteToExport = note;
        } else {
          // Decrypt for download
          noteToExport = await this.decryptNoteForDownload(note, password);
        }
      }

      console.log("third")
      // Handle PDF export
      if (fileType === 'pdf') {
        if (pdfSettings) {
          const container = this.createPdfContent(noteToExport, pdfSettings.includeTitle);
          document.body.appendChild(container);
  
          const fileName = `${noteContentService.getFirstLine(noteToExport.content)}.pdf`;
          
          const options = {
            margin: pdfSettings.margin,
            filename: fileName,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: {
              scale: pdfSettings.scale,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff'
            },
            jsPDF: {
              unit: 'mm',
              format: pdfSettings.pageSize,
              orientation: pdfSettings.isLandscape ? 'landscape' : 'portrait'
            }
          };

          
          try {
            const worker = html2pdf().set(options).from(container);
            const pdfBlob = await worker.output('blob');
            document.body.removeChild(container);
  
            const pdfUrl = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = pdfUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
  
            setTimeout(() => {
              setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
            }, 100);
  
            return true;
          } catch (error) {
            if (document.body.contains(container)) {
              document.body.removeChild(container);
            }
            throw error;
          }
        } else if (onPdfExport) {
          onPdfExport(noteToExport);
          return;
        } else {
          throw new Error('Either PDF settings or onPdfExport callback is required for PDF export');
        }
      }
      console.log("fourth")
      // Handle other file types
      const { mimeType } = this.getFileTypeInfo(fileType);
      const fileName = this.getDownloadFilename(noteToExport, fileType === 'json' ? 'json' : fileType, keepEncrypted);
      console.log("fifth")
      // Format content based on file type
      const content = this.formatNoteContent(noteToExport, fileType);
      console.log("sixth")
      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  }

  /**
   * Helper to decrypt a note for download
   * @private
   */
  async decryptNoteForDownload(note, password) {
    console.log("decryptNoteForDownload")
    try {
      const verifyBypass = localStorage.getItem('skipPasswordVerification') === 'true'
      const storedPassword = await passwordStorage.getPassword(note.id);
      if (!verifyBypass){
        if (!storedPassword || password !== storedPassword) {
          throw new Error('Invalid password');
        }
      }

      const { decryptNote } = await import('./encryption');
      const decryptResult = await decryptNote(note, password, false);
      
      if (!decryptResult.success) {
        throw new Error('Failed to decrypt note');
      }

      return decryptResult.note;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw error;
    }
  }

 /**
   * Process embedded content in text (links, images, gifs)
   * @param {string} content - Raw text content
   * @returns {string} - Processed content with proper HTML formatting
   */
 processEmbeddedContent(content) {
    // Convert markdown image syntax to HTML
    content = content.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
    
    // Convert markdown links to HTML
    content = content.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    
    // Convert plain URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    content = content.replace(urlRegex, '<a href="$1">$1</a>');

    return content;
  }

  /**
   * Create a new note object
   * @param {string} content - Note content
   * @param {string} title - Optional title (filename without extension)
   * @param {Date} fileDate - File creation/modification date
   * @returns {Object} - New note object
   */
  createNoteObject(content, title = '', fileDate = new Date(), originalNote = null) {
    const timestamp = fileDate.getTime();
    
    return {
      id: originalNote?.id || timestamp,
      content: content,
      dateModified: fileDate.toISOString(),
      dateCreated: 
        // Prefer metadata dateCreated 
        originalNote?.dateCreated || 
        // If no metadata, try note's ID as a timestamp
        (typeof originalNote?.id === 'number' ? originalNote.id.toString() : 
        // If all else fails, use current timestamp
        timestamp.toString()), 
      pinned: originalNote?.pinned || false,
      caretPosition: originalNote?.caretPosition || 0,
      parentFolderId: originalNote?.parentFolderId || null
    };
  }

  /**
   * Format content with proper div wrapping and newline handling
   * @param {string} content - Raw content
   * @param {string} title - Note title
   * @returns {string} - Formatted HTML content
   */
  formatContent(content, title) {
    // Start with the title div
    let formattedContent = `<div>${title}</div>`;
    
    // Split content into lines and process each
    const lines = content.split('\n');
    
    // Add each line wrapped in a div, including empty lines
    lines.forEach(line => {
        if (line.length > 0){
            formattedContent += `<div>${line}</div>`;
        } else {
            formattedContent += `<div><br></div>`;
        }
    });
    
    return formattedContent;
  }

  formatNoteContent(note, fileType) {
    switch (fileType) {
      case 'md':
      case 'text':
        return this.jsonToText(note.content);

      case 'json':
        if (note.locked && note.encrypted && localStorage.getItem('jsonAsEncrypted') === 'true') {
          // For encrypted JSON, include all encryption-related fields
          return JSON.stringify({
            id: note.id,
            content: note.content,
            dateModified: note.dateModified,
            pinned: note.pinned,
            locked: note.locked,
            encrypted: note.encrypted,
            keyParams: note.keyParams,
            iv: note.iv,
            visibleTitle: note.visibleTitle
          }, null, 2);
        } else {
          // For unencrypted JSON, clean export
          return JSON.stringify({
            id: note.id,
            content: note.content,
            dateModified: note.dateModified,
            pinned: note.pinned,
            locked: note.locked
          }, null, 2);
        }
  
      default:
        return note.content;
    }
  }

  /**
   * Handle JSON file import
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @param {Date} fileDate - File creation/modification date
   * @returns {Object} - Processed note object
   */
  async handleJsonImport(content, filename, fileDate) {
    try {
      const parsedContent = JSON.parse(content);
      const notesToProcess = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
      const validNotes = [];
      const validFolders = [];
      const invalidItems = [];
  
      // First pass: Process all items and separate folders from notes
      for (const item of notesToProcess) {
        try {
          // Basic validation - must be object with content
          if (typeof item !== 'object' || item === null || !item.content) {
            invalidItems.push({ item, reason: 'Missing required content' });
            continue;
          }
  
          // Check if it's a folder
          if (item.type === 'folder') {
            const processedFolder = {
              id: item.id || fileDate.getTime(),
              content: item.content,
              dateModified: item.dateModified || fileDate.toISOString(),
              type: 'folder',
              pinned: Boolean(item.pinned),
              locked: Boolean(item.locked),
              isOpen: Boolean(item.isOpen),
              parentFolderId: item.parentFolderId || null
            };
  
            validFolders.push(processedFolder);
          } else {
            // Process as a note
            const processedNote = {
              id: item.id || fileDate.getTime(),
              content: item.content,
              dateModified: item.dateModified || fileDate.toISOString(),
              dateCreated: item.dateCreated || item.id || fileDate.toISOString(),
              pinned: Boolean(item.pinned),
              caretPosition: Number(item.caretPosition) || 0,
              parentFolderId: item.parentFolderId || null,
              locked: Boolean(item.locked),
              encrypted: Boolean(item.encrypted)
            };
  
            // Preserve encrypted note properties
            if (item.encrypted) {
              processedNote.keyParams = item.keyParams;
              processedNote.iv = item.iv;
              processedNote.visibleTitle = item.visibleTitle;
            }
  
            validNotes.push(processedNote);
          }
        } catch (itemError) {
          invalidItems.push({ item, reason: itemError.message });
        }
      }
  
      // Create a map of folder IDs to ensure parent folders exist
      const folderMap = new Map(validFolders.map(folder => [folder.id, folder]));
  
      // Verify and fix parentFolderId references
      [...validNotes, ...validFolders].forEach(item => {
        if (item.parentFolderId && !folderMap.has(item.parentFolderId)) {
          // If parent folder doesn't exist in the import, remove the reference
          item.parentFolderId = null;
        }
      });
  
      // Combine and return both folders and notes
      const combinedItems = [...validFolders, ...validNotes];
  
      // If no valid items were found, throw error
      if (combinedItems.length === 0) {
        throw new Error(`No valid items found in ${filename}`);
      }
  
      // Log warning for invalid items
      if (invalidItems.length > 0) {
        console.warn(`Skipped ${invalidItems.length} invalid items during import:`, invalidItems);
      }
  
      return combinedItems;
    } catch (error) {
      console.error('Error importing JSON:', {
        filename,
        errorMessage: error.message,
        errorStack: error.stack
      });
      throw new Error(`Invalid JSON format in ${filename}: ${error.message}`);
    }
  }

  /**
   * Handle Markdown file import
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @param {Date} fileDate - File creation/modification date
   * @returns {Object} - Processed note object
   */
  async handleMarkdownImport(content, filename, fileDate) {
    const processedContent = this.processEmbeddedContent(content);
    const title = filename.replace(/\.md$/, '');
    const formattedContent = this.formatContent(processedContent, title);
    return [this.createNoteObject(formattedContent, title, fileDate)];
  }

  /**
   * Handle plain text file import
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @param {Date} fileDate - File creation/modification date
   * @returns {Object} - Processed note object
   */
  async handleTextImport(content, filename, fileDate) {
    const processedContent = this.processEmbeddedContent(content);
    const title = filename.replace(/\.txt$/, '');
    const formattedContent = this.formatContent(processedContent, title);
    return [this.createNoteObject(formattedContent, title, fileDate)];
  }

  /**
   * Import notes from files
   * @param {FileList|File[]} files - Files to import
   * @param {Object} options - Import options
   * @param {boolean} options.openLastImported - Whether to open the last imported note
   * @param {Function} options.onSuccess - Callback for successful import
   * @param {Function} options.onError - Callback for import errors
   * @param {Function} options.setSelectedId - Function to set selected note ID
   * @param {Function} options.setNotes - Function to update notes list
   * @returns {Promise<Object>} - Import results
   */
  async importNotes(files, { openLastImported = false, onSuccess, onError, setSelectedId, setNotes } = {}) {
    const results = {
      successful: [],
      failed: [],
      skipped: [],
      lastImportedId: null
    };
  
    for (const file of files) {
      try {
        const content = await file.text();
        const fileType = file.type || this.inferFileType(file.name);
        const handler = this.supportedImportTypes[fileType];
  
        if (!handler) {
          throw new Error(`Unsupported file type: ${fileType}`);
        }
  
        // Get file creation/modification date
        const fileDate = new Date(file.lastModified || Date.now());
        const importedNotes = await handler(content, file.name, fileDate);
        
        // Save successfully parsed notes
        for (const note of importedNotes) {
          try {
            await storageService.writeNote(note.id, note);
            results.successful.push({
              id: note.id,
              filename: file.name
            });
            results.lastImportedId = note.id;
          } catch (noteError) {
            results.skipped.push({
              filename: file.name,
              error: noteError.message
            });
          }
        }
      } catch (error) {
        results.failed.push({
          filename: file.name,
          error: error.message
        });
        if (onError) onError(error, file.name);
      }
    }
  
    // Update notes list to reflect new ordering
    const updatedNotes = await storageService.getAllNotes();
    if (setNotes) {
      const sortedNotes = updatedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.dateModified) - new Date(a.dateModified);
      });
      setNotes(sortedNotes);
    }
  
    // Set selected note if requested
    if (openLastImported && results.lastImportedId && setSelectedId) {
      setSelectedId(results.lastImportedId);
    }
  
    if (onSuccess) {
      onSuccess(results);
    }
  
    // Return results
    return results;
  }

  /**
   * Infer file type from filename
   * @param {string} filename - Name of the file
   * @returns {string} - MIME type
   */
  inferFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain'
    };
    return mimeTypes[extension] || 'text/plain';
  };
}

export const noteImportExportService = new NoteImportExportService();