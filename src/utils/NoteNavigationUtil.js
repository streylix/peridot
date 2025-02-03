class NoteNavigationUtil {
  constructor() {
    this.history = [null];
    this.subscribers = new Set();
    this.currentNoteId = null;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  push(noteId) {
    if (noteId !== this.currentNoteId) {
      this.history.push(this.currentNoteId);
      this.currentNoteId = noteId;
      this.notifySubscribers(noteId);
    }
  }

  back() {
    if (this.history.length > 1) {
      const previousNoteId = this.history.pop();
      this.currentNoteId = previousNoteId;
      this.notifySubscribers(previousNoteId);
      return previousNoteId;
    }
    return null;
  }

  notifySubscribers(noteId) {
    this.subscribers.forEach(callback => callback(noteId));
  }

  canGoBack() {
    return this.history.length > 1;
  }

  getCurrentNote() {
    return this.currentNoteId;
  }
}

export const noteNavigation = new NoteNavigationUtil();