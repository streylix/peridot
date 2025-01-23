class NavigationHistory {
  constructor() {
    this.history = [];
  }

  push(state) {
    console.log('Previous window:', this.history[this.history.length - 1]);
    this.history.push(state);
  }
  
  back() {
    if (this.history.length > 1) {
      console.log('Updated history:', this.history);
      const previousState = this.history[this.history.length - 1];
      this.history.pop();
      console.log('Previous state:', previousState);
      return previousState;
    }
    if (this.history.length === 1 && this.history[0] !== null) {
      return null; // Return to empty window
    }
    console.log('No previous state available');
    return null;
  }

  canGoBack() {
    // Can go back if more than 1 item in history OR if only item isn't null
    const canGo = this.history.length > 1 || (this.history.length === 1 && this.history[0] !== null);
    console.log('Can go back?', canGo, 'History length:', this.history.length);
    return canGo;
  }

  debugHistory() {
    console.log('Full history:', this.history);
  }
}

export default NavigationHistory;