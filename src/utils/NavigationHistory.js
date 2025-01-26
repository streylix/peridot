class NavigationHistory {
  constructor() {
    this.history = [null];
  }

  push(state) {
    console.log('Previous window:', this.history[this.history.length - 1]);
    this.history.push(state);
  }
  
  back() {
    if (this.history.length > 1) {
      const previousState = this.history[this.history.length - 1];
      this.history.pop();
      return previousState;
    }
    return null;
  }

  canGoBack() {
    const canGo = this.history.length > 1 || (this.history.length === 1 && this.history[0] !== null);
    return canGo;
  }

  debugHistory() {
    console.log('Full history:', this.history);
  }
}

export default NavigationHistory;