/**
 * DownloadUtils - Utilities for downloading notes and files
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { noteContentService } from './NoteContentService';

/**
 * Download notes as a zip file
 * @param {Array} notes - The notes to download
 * @param {Object} options - Configuration options
 */
export const downloadAsZip = async (notes, options = {}) => {
  if (!notes || notes.length === 0) {
    console.error('No notes to download');
    return;
  }

  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const folderName = options.folderName || `peridot-notes-${timestamp}`;
  const folder = zip.folder(folderName);

  // Process each note
  await Promise.all(notes.map(async (note) => {
    const noteTitle = noteContentService.getFirstLine(note.content) || 'Untitled';
    const safeTitle = noteTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const fileName = `${safeTitle}-${note.id}.json`;

    // Convert note to JSON
    const noteData = JSON.stringify({
      id: note.id,
      content: note.content,
      dateCreated: note.dateCreated,
      dateModified: note.dateModified,
      pinned: note.pinned,
      locked: note.locked,
      encrypted: note.encrypted,
      folder_path: note.folder_path,
      visible_title: note.visible_title,
      tags: note.tags,
      userId: note.userId
    }, null, 2);

    // Add file to zip
    folder.file(fileName, noteData);
  }));

  // Generate and download zip
  try {
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${folderName}.zip`);
    return true;
  } catch (error) {
    console.error('Error creating zip file:', error);
    return false;
  }
}; 