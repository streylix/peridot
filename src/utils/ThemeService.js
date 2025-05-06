/**
 * ThemeService - Manages application themes (dark/light mode)
 */

const THEME_STORAGE_KEY = 'peridot_theme';

class ThemeService {
  constructor() {
    this.theme = this.loadTheme() || 'light';
    this.listeners = [];
  }

  /**
   * Load theme from localStorage
   */
  loadTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
      console.error('Error loading theme from localStorage:', error);
      return null;
    }
  }

  /**
   * Save theme to localStorage
   */
  saveTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.error('Error saving theme to localStorage:', error);
    }
  }

  /**
   * Get current theme
   */
  getTheme() {
    return this.theme;
  }

  /**
   * Set theme and update DOM
   */
  setTheme(newTheme) {
    if (newTheme !== 'light' && newTheme !== 'dark') {
      console.error('Invalid theme:', newTheme);
      return;
    }

    this.theme = newTheme;
    this.saveTheme(newTheme);
    this.applyTheme();
    this.notifyListeners();
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme() {
    const newTheme = this.theme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
    return newTheme;
  }

  /**
   * Apply the current theme to the DOM
   */
  applyTheme() {
    if (this.theme === 'dark') {
      document.documentElement.classList.add('dark-theme');
      document.documentElement.classList.remove('light-theme');
    } else {
      document.documentElement.classList.add('light-theme');
      document.documentElement.classList.remove('dark-theme');
    }
  }

  /**
   * Initialize theme on application startup
   */
  initialize() {
    this.applyTheme();
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      console.error('Theme listener must be a function');
      return;
    }
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify listeners of theme changes
   */
  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.theme);
      } catch (error) {
        console.error('Error in theme listener:', error);
      }
    });
  }
}

// Create a singleton instance
export const themeService = new ThemeService();

// Initialize on load
themeService.initialize(); 