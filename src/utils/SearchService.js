import { noteContentService } from "./NoteContentService";

class SearchService {
    /**
     * Checks if a note is inside a locked folder hierarchy
     * @param {Object} note - The note to check
     * @param {Array} allNotes - All notes in the system
     * @returns {boolean} True if note is in a locked folder
     */
    isInLockedFolder(note, allNotes) {
      let currentParentId = note.parentFolderId;
      
      while (currentParentId) {
        const parentFolder = allNotes.find(n => n.id === currentParentId);
        if (!parentFolder) break;
        
        if (parentFolder.locked) {
          return true;
        }
        
        currentParentId = parentFolder.parentFolderId;
      }
      
      return false;
    }
  
    /**
     * Determines if a note matches the search criteria
     * @param {Object} note - The note to check
     * @param {string} searchTerm - The search term
     * @param {Array} allNotes - All notes in the system
     * @returns {boolean} Whether the note matches
     */
    matchesSearch(note, searchTerm, allNotes) {
      const search = searchTerm.toLowerCase();
      
      // Only check notes, not folders
      if (note.type === 'folder') {
        return false;
      }
  
      // Check if note is in a locked folder hierarchy
      if (this.isInLockedFolder(note, allNotes)) {
        return false;
      }
      
      // For notes, check title and content
      const title = (note.locked && note.visibleTitle) ? 
        note.visibleTitle : 
        (note.content ? noteContentService.getFirstLine(note.content) : 'Untitled');
        
      const content = note.content ? 
        noteContentService.getPreviewContent(note.content) : 
        '';
      
      return title.toLowerCase().includes(search) || 
             content.toLowerCase().includes(search);
    }
  
    /**
     * Searches notes showing only matching notes regardless of folder structure
     * @param {Array} notes - All notes in the system
     * @param {string} searchTerm - The search term
     * @returns {Array} Filtered notes without folder structure
     */
    searchNotes(notes, searchTerm) {
      if (!searchTerm) {
        // If no search term, return top-level items only without folders
        return notes.filter(item => !item.parentFolderId);
      }
  
      // Return only matching notes, ignoring folder structure
      return notes.filter(note => this.matchesSearch(note, searchTerm, notes));
    }
  }
  
  export const searchService = new SearchService();