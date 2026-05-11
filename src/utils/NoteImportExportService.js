import { apiService } from './ApiService';
import { noteContentService } from './NoteContentService';
import html2pdf from 'html2pdf.js';

const looksLikeLegacyHtml = (content) =>
  typeof content === 'string' && /<\w+[^>]*>/.test(content.trimStart().slice(0, 64));

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

class NoteImportExportService {
  constructor() {
    this.generatedImportIds = new Set();
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

  legacyHtmlToMarkdown(content = '') {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    tempDiv.querySelectorAll('img').forEach(img => {
      img.replaceWith(`![${img.getAttribute('alt') || ''}](${img.getAttribute('src') || ''})`);
    });
    tempDiv.querySelectorAll('a').forEach(link => {
      link.replaceWith(`[${link.textContent || link.href}](${link.getAttribute('href') || ''})`);
    });

    const divs = Array.from(tempDiv.querySelectorAll('div'));
    if (divs.length > 0) {
      return divs.map(div => div.textContent.trim()).join('\n');
    }
    return tempDiv.textContent.trim();
  }

  markdownToPlainText(content = '') {
    return String(content)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^(\s{0,3})#{1,6}\s+/gm, '$1')
      .replace(/^(\s{0,3})[-*+]\s+\[[ xX]\]\s+/gm, '$1')
      .replace(/^(\s{0,3})[-*+]\s+/gm, '$1')
      .replace(/^(\s{0,3})\d+\.\s+/gm, '$1')
      .replace(/^(\s{0,3})>\s?/gm, '$1')
      .replace(/(\*\*|__|~~|`|\*|_)/g, '')
      .trim();
  }

  contentToMarkdown(content = '') {
    if (!content) return '';
    return looksLikeLegacyHtml(content) ? this.legacyHtmlToMarkdown(content) : String(content);
  }

  isLegacyEncryptedNote(item) {
    if (!item || item.type === 'folder') return false;
    const keyParams = item.keyParams || item.key_params || {};
    return item.encrypted === true
      && (
        Array.isArray(item.content)
        || item.encryptedContent != null
        || item.encrypted_content != null
      )
      && (item.iv != null || item.encIv != null || item.enc_iv != null)
      && (keyParams.salt != null || item.salt != null);
  }

  isLegacyLockedFolder(item) {
    const verificationData = item?.verificationData || item?.verification_data;
    return item?.type === 'folder' && item.locked === true && Boolean(verificationData);
  }

  markdownToHtml(content = '') {
    const lines = String(content).split('\n');
    const html = [];
    let inCodeBlock = false;
    let listType = null;

    const closeList = () => {
      if (listType) {
        html.push(`</${listType}>`);
        listType = null;
      }
    };

    const inline = (text) => escapeHtml(text)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    lines.forEach(rawLine => {
      if (/^\s*```/.test(rawLine)) {
        closeList();
        html.push(inCodeBlock ? '</code></pre>' : '<pre><code>');
        inCodeBlock = !inCodeBlock;
        return;
      }

      if (inCodeBlock) {
        html.push(`${escapeHtml(rawLine)}\n`);
        return;
      }

      const line = rawLine.trimEnd();
      if (!line.trim()) {
        closeList();
        html.push('<br>');
        return;
      }

      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        return;
      }

      const checkbox = line.match(/^\s{0,3}[-*+]\s+\[([ xX])\]\s+(.+)$/);
      if (checkbox) {
        if (listType !== 'ul') {
          closeList();
          html.push('<ul>');
          listType = 'ul';
        }
        const checked = checkbox[1].toLowerCase() === 'x' ? ' checked' : '';
        html.push(`<li><input type="checkbox"${checked} disabled> ${inline(checkbox[2])}</li>`);
        return;
      }

      const unordered = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
      if (unordered) {
        if (listType !== 'ul') {
          closeList();
          html.push('<ul>');
          listType = 'ul';
        }
        html.push(`<li>${inline(unordered[1])}</li>`);
        return;
      }

      const ordered = line.match(/^\s{0,3}\d+\.\s+(.+)$/);
      if (ordered) {
        if (listType !== 'ol') {
          closeList();
          html.push('<ol>');
          listType = 'ol';
        }
        html.push(`<li>${inline(ordered[1])}</li>`);
        return;
      }

      closeList();
      html.push(`<p>${inline(line)}</p>`);
    });

    closeList();
    if (inCodeBlock) html.push('</code></pre>');
    return html.join('');
  }

  markdownBodyWithoutTitle(content = '') {
    const lines = String(content).split('\n');
    const index = lines.findIndex(line => line.trim());
    if (index === -1) return '';
    return [...lines.slice(0, index), ...lines.slice(index + 1)].join('\n');
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

    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = 'font-size: 16px; color: #000000;';
    const markdownContent = this.contentToMarkdown(note.content);
    contentContainer.innerHTML = this.markdownToHtml(
      includeTitle ? this.markdownBodyWithoutTitle(markdownContent) : markdownContent
    );
    Array.from(contentContainer.getElementsByTagName('img')).forEach(img => {
      img.style.cssText = 'max-width: 100%; height: auto; margin: 16px 0; display: block;';
      img.crossOrigin = 'anonymous';
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
          const folderName = folder
            ? (folder.visibleTitle || noteContentService.getFirstLine(folder.content) || 'folder')
            : 'folder';
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
      // Handle encrypted notes
      if (isEncrypted && !password) {
        throw new Error('Password required for encrypted note export');
      }
      if (isEncrypted && password) {
        noteToExport = await this.decryptNoteForDownload(note, password);
      }

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
      // Handle other file types
      const { mimeType, extension } = this.getFileTypeInfo(fileType);
      const fileName = this.getDownloadFilename(noteToExport, extension, false);
      // Format content based on file type
      const content = this.formatNoteContent(noteToExport, fileType);
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
    const result = await apiService.unlockNote(note.id, password);
    if (!result.success || !result.note) throw new Error('Invalid password');
    return result.note;
  }

  /**
   * Create a new note object
   * @param {string} content - Note content
   * @param {string} title - Optional title (filename without extension)
   * @param {Date} fileDate - File creation/modification date
   * @returns {Object} - New note object
   */
  createNoteObject(content, title = '', fileDate = new Date(), originalNote = null) {
    const timestamp = this.generateImportId(fileDate);
    
    return {
      id: originalNote?.id || timestamp,
      content: content,
      visibleTitle: title || noteContentService.getFirstLine(content),
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

  generateImportId(fileDate = new Date()) {
    let id = fileDate.getTime();
    while (this.generatedImportIds.has(id)) id += 1;
    this.generatedImportIds.add(id);
    return id;
  }

  formatNoteContent(note, fileType) {
    switch (fileType) {
      case 'md':
        return this.contentToMarkdown(note.content);

      case 'text':
        return this.markdownToPlainText(this.contentToMarkdown(note.content));
  
      case 'json':
        if (note.locked && note.encrypted) {
          return JSON.stringify({
            schemaVersion: 2,
            id: note.id,
            dateModified: note.dateModified,
            dateCreated: note.dateCreated,
            type: note.type || 'note',
            pinned: note.pinned,
            locked: note.locked,
            encrypted: note.encrypted,
            visibleTitle: note.visibleTitle,
            parentFolderId: note.parentFolderId,
            exportNotice: 'Encrypted content is stored server-side and is not included in client JSON export. Export after password verification to include plaintext markdown content.'
          }, null, 2);
        }

        if (note.type === 'folder') {
          const exportData = {
            schemaVersion: 2,
            id: note.id,
            content: note.content,
            dateCreated: note.dateCreated,
            dateModified: note.dateModified,
            type: 'folder',
            pinned: note.pinned,
            locked: note.locked,
            isOpen: note.isOpen,
            parentFolderId: note.parentFolderId,
            visibleTitle: note.visibleTitle || noteContentService.getFirstLine(note.content)
          };
          return JSON.stringify(exportData, null, 2);
        } else {
          return JSON.stringify({
            schemaVersion: 2,
            id: note.id,
            content: note.content,
            dateCreated: note.dateCreated,
            dateModified: note.dateModified,
            type: note.type || 'note',
            pinned: note.pinned,
            locked: note.locked,
            caretPosition: note.caretPosition,
            parentFolderId: note.parentFolderId,
            visibleTitle: note.visibleTitle
          }, null, 2);
        }
  
      default:
        return note.content;
    }
  }

  sanitizeLegacyContent(content) {
    if (!content) return '';
    
    let sanitized = content;
    
    // Create a temporary div to parse HTML content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    // Remove all embed tags and add a placeholder message
    const embeds = tempDiv.getElementsByTagName('embed');
    while (embeds.length > 0) {
      const embed = embeds[0];
      const src = embed.getAttribute('src');
      const placeholder = document.createElement('div');
      placeholder.innerHTML = `<div style="padding: 10px; margin: 5px 0; color: #666; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">Embedded content from: ${src} (no longer supported)</div>`;
      embed.parentNode.replaceChild(placeholder, embed);
    }
    
    // Remove any iframe tags
    const iframes = tempDiv.getElementsByTagName('iframe');
    while (iframes.length > 0) {
      const iframe = iframes[0];
      const src = iframe.getAttribute('src');
      const placeholder = document.createElement('div');
      placeholder.innerHTML = `<div style="padding: 10px; margin: 5px 0; color: #666; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">Embedded content from: ${src} (no longer supported)</div>`;
      iframe.parentNode.replaceChild(placeholder, iframe);
    }
    
    // Get the sanitized content
    sanitized = tempDiv.innerHTML;
    
    // Clean up any remaining problematic tags or attributes
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    
    return sanitized;
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
  
      for (const item of notesToProcess) {
        try {
          if (typeof item !== 'object' || item === null) {
            invalidItems.push({ item, reason: 'Invalid item' });
            continue;
          }
  
          if (item.type === 'folder') {
            const folderTitle = item.visibleTitle || noteContentService.getFirstLine(item.content || item.title || '');
            if (this.isLegacyLockedFolder(item)) {
              validFolders.push({
                ...item,
                id: item.id || this.generateImportId(fileDate),
                dateModified: item.dateModified || fileDate.toISOString(),
                type: 'folder',
                pinned: Boolean(item.pinned),
                locked: true,
                isOpen: false,
                parentFolderId: item.parentFolderId || null,
                visibleTitle: folderTitle || 'Untitled Folder',
                __legacyEncryptedImport: true
              });
              continue;
            }

            const processedFolder = {
              id: item.id || this.generateImportId(fileDate),
              content: folderTitle,
              dateModified: item.dateModified || fileDate.toISOString(),
              type: 'folder',
              pinned: Boolean(item.pinned),
              locked: false,
              isOpen: Boolean(item.isOpen),
              parentFolderId: item.parentFolderId || null,
              visibleTitle: folderTitle
            };
  
            validFolders.push(processedFolder);
          } else {
            if (this.isLegacyEncryptedNote(item)) {
              validNotes.push({
                ...item,
                id: item.id || this.generateImportId(fileDate),
                dateModified: item.dateModified || fileDate.toISOString(),
                type: item.type || 'note',
                pinned: Boolean(item.pinned),
                locked: true,
                encrypted: true,
                parentFolderId: item.parentFolderId || null,
                visibleTitle: item.visibleTitle || item.visible_title || 'Untitled',
                __legacyEncryptedImport: true
              });
              continue;
            }

            if (item.locked && item.encrypted && !item.content) {
              invalidItems.push({ item, reason: 'Server-encrypted JSON export does not include importable content' });
              continue;
            }

            // Process as a note
            const processedNote = {
              id: item.id || this.generateImportId(fileDate),
              dateModified: item.dateModified || fileDate.toISOString(),
              dateCreated: item.dateCreated || item.id || fileDate.toISOString(),
              pinned: Boolean(item.pinned),
              caretPosition: Number(item.caretPosition) || 0,
              parentFolderId: item.parentFolderId || null,
              locked: false,
              encrypted: false,
              visibleTitle: item.visibleTitle || item.title
            };
  
            let processedContent = this.sanitizeLegacyContent(item.content || '');
            if (looksLikeLegacyHtml(processedContent)) {
              processedContent = this.legacyHtmlToMarkdown(processedContent);
            }
            if (item.title && typeof item.title === 'string' && !processedContent.trim()) {
              processedContent = item.title;
            }
            processedNote.content = processedContent;
  
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
          item.parentFolderId = null;
        }
      });
  
      const combinedItems = [...validFolders, ...validNotes];
  
      if (combinedItems.length === 0) {
        throw new Error(`No valid items found in ${filename}`);
      }
  
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
    const title = filename.replace(/\.md$/i, '');
    return [this.createNoteObject(content, title, fileDate)];
  }

  /**
   * Handle plain text file import
   * @param {string} content - File content
   * @param {string} filename - Original filename
   * @param {Date} fileDate - File creation/modification date
   * @returns {Object} - Processed note object
   */
  async handleTextImport(content, filename, fileDate) {
    const title = filename.replace(/\.txt$/i, '');
    return [this.createNoteObject(content, title, fileDate)];
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
    this.generatedImportIds = new Set();
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
        
        const legacyCount = importedNotes.filter(n => n.__legacyEncryptedImport).length;
        console.log(`[import] ${importedNotes.length} items, ${legacyCount} legacy-encrypted`);
        // Save successfully parsed notes
        for (const note of importedNotes) {
          try {
            if (note.__legacyEncryptedImport) {
              const legacyPayload = { ...note };
              delete legacyPayload.__legacyEncryptedImport;
              console.log('[import] legacy POST', { id: note.id, title: note.visibleTitle });
              await apiService.importLegacyEncryptedItem(legacyPayload);
            } else {
              await apiService.writeNote(note.id, note);
            }
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
    const updatedNotes = await apiService.getAllNotes();
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
