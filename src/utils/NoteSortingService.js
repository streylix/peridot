import { noteContentService } from './NoteContentService';

class NoteSortingService {
  constructor() {
    this.defaultSortMethod = 'dateModified-desc';
    this.prioritizePinned = localStorage.getItem('prioritizePinned') === 'true';
    this.lastFilteredNotes = null;
  }

  setPrioritizePinned(value) {
    this.prioritizePinned = value;
    localStorage.setItem('prioritizePinned', value);
  }

  getSortMethod() {
    return localStorage.getItem('sortMethod') || this.defaultSortMethod;
  }

  setSortMethod(method) {
    localStorage.setItem('sortMethod', method);
    // Reset filtered notes when switching to non-filter sort
    if (method !== 'locked' && method !== 'unlocked') {
      this.lastFilteredNotes = null;
    }
  }

  sortNotes(notes, method = this.getSortMethod()) {
    if (!notes || notes.length === 0) return [];
    
    let workingNotes = [...notes];
    
    switch (method) {
      case 'alpha-asc':
        return this.sortByAlpha(workingNotes, true);
      case 'alpha-desc':
        return this.sortByAlpha(workingNotes, false);
      case 'dateModified-desc':
        return this.sortByDateModified(workingNotes, false);
      case 'dateModified-asc':
        return this.sortByDateModified(workingNotes, true);
      case 'dateCreated-desc':
        return this.sortByDateCreated(workingNotes, false);
      case 'dateCreated-asc':
        return this.sortByDateCreated(workingNotes, true);
      default:
        return this.sortByDateModified(workingNotes, false);
    }
  }

  sortByAlpha(notes, ascending) {
    return notes.sort((a, b) => {
      if (this.prioritizePinned && a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      const titleA = a.locked ? 
        (a.visibleTitle || noteContentService.getFirstLine(a.content)) : 
        noteContentService.getFirstLine(a.content);
      
      const titleB = b.locked ? 
        (b.visibleTitle || noteContentService.getFirstLine(b.content)) : 
        noteContentService.getFirstLine(b.content);

      return ascending ? 
        titleA.localeCompare(titleB) : 
        titleB.localeCompare(titleA);
    });
  }

  sortByDateModified(notes, ascending) {
    return notes.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return ascending ? 
        new Date(a.dateModified) - new Date(b.dateModified) : 
        new Date(b.dateModified) - new Date(a.dateModified);
    });
  }

  sortByDateCreated(notes, ascending) {
    return notes.sort((a, b) => {
      if (this.prioritizePinned && a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      const dateA = new Date(a.id);
      const dateB = new Date(b.id);
      return ascending ? dateA - dateB : dateB - dateA;
    });
  }
}

export const noteSortingService = new NoteSortingService();