import { noteContentService } from './NoteContentService';
import { FolderService } from './folderUtils';

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
    if (method !== 'locked' && method !== 'unlocked') {
      this.lastFilteredNotes = null;
    }
  }

  sortNotes(notes, method = this.getSortMethod()) {
    if (!notes || notes.length === 0) return [];
    let workingNotes = [...notes];

    // Always sort folders first
    workingNotes.sort((a, b) => {
      if (FolderService.isFolder(a) && !FolderService.isFolder(b)) return -1;
      if (!FolderService.isFolder(a) && FolderService.isFolder(b)) return 1;
      return 0;
    });

    // Split into folders and non-folders
    const folders = workingNotes.filter(n => FolderService.isFolder(n));
    const nonFolders = workingNotes.filter(n => !FolderService.isFolder(n));

    // Sort each group
    const sortedNonFolders = this.applySortMethod(nonFolders, method);
    const sortedFolders = this.applySortMethod(folders, method);

    return [...sortedFolders, ...sortedNonFolders];
  }

  applySortMethod(notes, method) {
    switch (method) {
      case 'alpha-asc':
        return this.sortByAlpha(notes, true);
      case 'alpha-desc':
        return this.sortByAlpha(notes, false);
      case 'dateModified-desc':
        return this.sortByDateModified(notes, false);
      case 'dateModified-asc':
        return this.sortByDateModified(notes, true);
      case 'dateCreated-desc':
        return this.sortByDateCreated(notes, false);
      case 'dateCreated-asc':
        return this.sortByDateCreated(notes, true);
      default:
        return this.sortByDateModified(notes, false);
    }
  }

  sortByAlpha(notes, ascending) {
    return notes.sort((a, b) => {
      if (this.prioritizePinned && a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      const getTitle = item => {
        if (FolderService.isFolder(item)) {
          return item.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || 'Untitled Folder';
        }
        return item.locked ? 
          (item.visibleTitle || noteContentService.getFirstLine(item.content)) :
          noteContentService.getFirstLine(item.content);
      };

      const titleA = getTitle(a);
      const titleB = getTitle(b);
      
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