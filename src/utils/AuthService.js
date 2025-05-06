// AuthService.js - Handles authentication with the Django backend

import { storageService } from './StorageService';

// Update API paths to match the Django backend endpoints
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://notes.peridot.software/api' 
  : '/api';

class AuthService {
  constructor() {
    this.currentUserId = localStorage.getItem('currentUserId');
    this.subscribers = new Set();
    this.serverAvailable = true;
    
    console.log("AuthService initialized with userId:", this.currentUserId);
    this.checkAuthStatus(); // Check auth status on initialization
  }
  
  /**
   * Check current authentication status
   */
  async checkAuthStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/check-auth/`, {
        method: 'GET',
        credentials: 'include', // Include cookies for session authentication
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("Auth status check:", data);
        
        if (data.isAuthenticated && data.user) {
          // Update local user info
          this.currentUserId = data.user.id.toString();
          localStorage.setItem('currentUserId', this.currentUserId);
          
          // Update storage service
          storageService.setAuthToken(null, this.currentUserId);
          
          // Notify subscribers
          this.notifySubscribers(true);
          return { success: true, user: data.user };
        }
      }
      
      // If not authenticated, clear local user info
      if (this.currentUserId) {
        localStorage.removeItem('currentUserId');
        this.currentUserId = null;
        this.notifySubscribers(false);
      }
      
      return { success: false };
    } catch (error) {
      console.error("Auth status check failed:", error);
      
      // If we have a local user ID, we can operate in local mode
      if (this.currentUserId) {
        this.serverAvailable = false;
        return { 
          success: true, 
          user: { id: this.currentUserId },
          localOnly: true 
        };
      }
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Log in with username and password
   */
  async login(username, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/login/`, {
        method: 'POST',
        credentials: 'include', // Include cookies for session authentication
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: username, password: password })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Authentication failed: ${response.status}`);
      }
      
      const data = await response.json();
      this.serverAvailable = true;
      
      console.log("Login successful, user:", data.user);
      
      // Store user ID
      if (data.user && data.user.id) {
        this.currentUserId = data.user.id.toString();
        localStorage.setItem('currentUserId', this.currentUserId);
      }
      
      // Update storage service with user ID
      storageService.setAuthToken(null, this.currentUserId);
      
      // Notify subscribers of authentication state change
      this.notifySubscribers(true);
      
      return { success: true, user: data.user || {} };
    } catch (error) {
      console.error('Login failed:', error);
      
      // Check if this is a network error (server unavailable)
      if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        this.serverAvailable = false;
        console.log("Server appears to be unavailable - switching to local mode");
        
        // If we have a userId, we can still work in local-only mode
        if (this.currentUserId) {
          // Notify subscribers we're authenticated (but in local mode)
          this.notifySubscribers(true);
          return { 
            success: true, 
            user: { id: this.currentUserId },
            localOnly: true
          };
        }
      }
      
      return { 
        success: false, 
        error: error.message || 'Authentication failed'
      };
    }
  }
  
  /**
   * Log out
   */
  async logout(notifyServer = true) {
    console.log("Logging out user");
    
    if (notifyServer && this.serverAvailable) {
      try {
        await fetch(`${API_BASE_URL}/logout/`, {
          method: 'POST',
          credentials: 'include', // Include cookies for session authentication
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('Logout API call failed:', error);
        // Continue with local logout even if API call fails
      }
    }
    
    // Clear user ID
    this.currentUserId = null;
    localStorage.removeItem('currentUserId');
    this.serverAvailable = true; // Reset server availability
    
    // Clear auth in storage service
    storageService.clearAuthToken();
    
    // Notify subscribers of authentication state change
    this.notifySubscribers(false);
    
    return { success: true };
  }
  
  /**
   * Check if user is currently authenticated
   */
  isAuthenticated() {
    const result = !!this.currentUserId;
    console.log("isAuthenticated check:", result, "UserId:", this.currentUserId);
    return result;
  }
  
  /**
   * Subscribe to authentication state changes
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  /**
   * Notify subscribers of authentication state changes
   */
  notifySubscribers(isAuthenticated) {
    console.log("Notifying subscribers of auth state change:", isAuthenticated);
    this.subscribers.forEach(callback => callback(isAuthenticated));
  }

  /**
   * Get current user information
   */
  async getUserInfo() {
    console.log("Getting user info");
    
    try {
      const response = await fetch(`${API_BASE_URL}/check-auth/`, {
        method: 'GET',
        credentials: 'include', // Include cookies for session authentication
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get user info: ${response.status}`);
      }
      
      const data = await response.json();
      this.serverAvailable = true;
      
      if (!data.isAuthenticated) {
        console.log("Server reports user is not authenticated");
        
        // If we have a local user ID, we can operate in local mode
        if (this.currentUserId) {
          console.log("Using local mode with stored userId");
          return { 
            success: true, 
            user: { id: this.currentUserId },
            localOnly: true 
          };
        }
        
        return { success: false, error: 'Not authenticated' };
      }
      
      console.log("User info retrieved:", data.user);
      
      // Update current user ID
      if (data.user && data.user.id) {
        this.currentUserId = data.user.id.toString();
        localStorage.setItem('currentUserId', this.currentUserId);
        storageService.setAuthToken(null, this.currentUserId);
      }
      
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Failed to get user info:', error);
      
      // Check if this is a network error (server unavailable)
      if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        this.serverAvailable = false;
        console.log("Server appears to be unavailable - switching to local mode");
        
        // If we have a userId, we can still work in local-only mode
        if (this.currentUserId) {
          return { 
            success: true, 
            user: { id: this.currentUserId },
            localOnly: true
          };
        }
      }
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Force reload user status
   */
  async reloadUserStatus() {
    console.log("Reloading user status");
    
    try {
      // Just call getUserInfo directly
      return await this.getUserInfo();
    } catch (error) {
      console.error("Error reloading user status:", error);
      
      // If network error and we have userId, use local mode
      if ((error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) && this.currentUserId) {
        this.serverAvailable = false;
        return { 
          success: true, 
          user: { id: this.currentUserId },
          localOnly: true
        };
      }
      
      return { success: false, error: error.message };
    }
  }
}

export const authService = new AuthService(); 