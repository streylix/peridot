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
    if (!notes || !Array.isArray(notes) || notes.length === 0) return [];
    
    // Filter out invalid notes
    const validNotes = notes.filter(note => note && typeof note === 'object');
    let workingNotes = [...validNotes];

    // Get all top-level items (items without a parent folder)
    const topLevelItems = workingNotes.filter(item => !item.parentFolderId);
    
    // Sort top-level items
    const sortedTopLevel = this.applySortMethod(topLevelItems, method);
    
    // For items with parent folders, we need to sort them within their folders
    const itemsByFolder = {};
    workingNotes.forEach(item => {
      if (item.parentFolderId) {
        if (!itemsByFolder[item.parentFolderId]) {
          itemsByFolder[item.parentFolderId] = [];
        }
        itemsByFolder[item.parentFolderId].push(item);
      }
    });

    // Sort items within each folder
    Object.keys(itemsByFolder).forEach(folderId => {
      itemsByFolder[folderId] = this.applySortMethod(itemsByFolder[folderId], method);
    });

    // Create final sorted array
    const sortedNotes = [];
    const processed = new Set();

    const addItemAndChildren = (item) => {
      if (processed.has(item.id)) return;
      processed.add(item.id);
      sortedNotes.push(item);

      // If this is a folder, add its sorted children
      if (this.isFolder(item) && itemsByFolder[item.id]) {
        itemsByFolder[item.id].forEach(child => {
          addItemAndChildren(child);
        });
      }
    };

    // Process all top-level items and their children
    sortedTopLevel.forEach(item => {
      addItemAndChildren(item);
    });

    return sortedNotes;
  }

  isFolder(item) {
    return item && item.type === 'folder';
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

  getItemTitle(item) {
    if (!item || !item.content) return 'Untitled';

    if (this.isFolder(item)) {
      const match = item.content.match(/<div[^>]*>(.*?)<\/div>/);
      return match ? match[1] : 'Untitled Folder';
    }

    if (item.locked && item.visibleTitle) {
      return item.visibleTitle;
    }

    // Extract first line from content
    const match = item.content.match(/<div[^>]*>(.*?)<\/div>/);
    return match ? match[1] : 'Untitled';
  }

  sortByAlpha(notes, ascending) {
    return [...notes].sort((a, b) => {
      // First handle pinned items
      if (this.prioritizePinned && a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      // Then sort by folder/non-folder
      const aIsFolder = this.isFolder(a);
      const bIsFolder = this.isFolder(b);
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1;
      }

      // Then sort by title
      const titleA = this.getItemTitle(a);
      const titleB = this.getItemTitle(b);
      
      return ascending ? 
        titleA.localeCompare(titleB) : 
        titleB.localeCompare(titleA);
    });
  }

  sortByDateModified(notes, ascending) {
    return [...notes].sort((a, b) => {
      // First sort by pinned
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      // Then sort by folder/non-folder
      const aIsFolder = this.isFolder(a);
      const bIsFolder = this.isFolder(b);
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1;
      }
      
      const dateA = new Date(a.dateModified || a.id || 0);
      const dateB = new Date(b.dateModified || b.id || 0);
      
      return ascending ?
        dateA - dateB :
        dateB - dateA;
    });
  }

  sortByDateCreated(notes, ascending) {
    return [...notes].sort((a, b) => {
      // First sort by pinned
      if (this.prioritizePinned && a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      // Then sort by folder/non-folder
      const aIsFolder = this.isFolder(a);
      const bIsFolder = this.isFolder(b);
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1;
      }
      
      const dateA = new Date(a.id || 0);
      const dateB = new Date(b.id || 0);
      
      return ascending ? dateA - dateB : dateB - dateA;
    });
  }
}

export const noteSortingService = new NoteSortingService();