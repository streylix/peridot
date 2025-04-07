// AuthService.js - Handles authentication with the Django backend

import { storageService } from './StorageService';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://notes.peridot.software/v1' 
  : 'http://localhost:8000/api';

class AuthService {
  constructor() {
    this.authToken = localStorage.getItem('authToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.tokenExpiry = localStorage.getItem('tokenExpiry');
    this.subscribers = new Set();
    
    // Setup token refresh
    this.setupTokenRefresh();
  }
  
  /**
   * Log in with username and password
   */
  async login(username, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Authentication failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store tokens
      this.authToken = data.access;
      this.refreshToken = data.refresh;
      
      localStorage.setItem('authToken', data.access);
      localStorage.setItem('refreshToken', data.refresh);
      
      // Store expiry time (tokens typically valid for 5 minutes)
      const expiryTime = new Date();
      expiryTime.setMinutes(expiryTime.getMinutes() + 5);
      this.tokenExpiry = expiryTime.toISOString();
      localStorage.setItem('tokenExpiry', this.tokenExpiry);
      
      // Also update storage service
      storageService.setAuthToken(data.access);
      
      // Notify subscribers of authentication state change
      this.notifySubscribers(true);
      
      return { success: true, user: data.user || {} };
    } catch (error) {
      console.error('Login failed:', error);
      return { 
        success: false, 
        error: error.message || 'Authentication failed'
      };
    }
  }
  
  /**
   * Refresh the authentication token
   */
  async refreshAuthToken() {
    if (!this.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/token/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh: this.refreshToken })
      });
      
      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update access token
      this.authToken = data.access;
      localStorage.setItem('authToken', data.access);
      
      // Update expiry time (tokens typically valid for 5 minutes)
      const expiryTime = new Date();
      expiryTime.setMinutes(expiryTime.getMinutes() + 5);
      this.tokenExpiry = expiryTime.toISOString();
      localStorage.setItem('tokenExpiry', this.tokenExpiry);
      
      // Also update storage service
      storageService.setAuthToken(data.access);
      
      return { success: true };
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.logout(); // Force logout on token refresh failure
      return { 
        success: false, 
        error: error.message || 'Token refresh failed'
      };
    }
  }
  
  /**
   * Set up automatic token refresh
   */
  setupTokenRefresh() {
    // Check for token expiration every minute
    setInterval(() => {
      if (!this.authToken || !this.tokenExpiry) return;
      
      const now = new Date();
      const expiry = new Date(this.tokenExpiry);
      
      // Refresh if token expires in less than 1 minute
      if (expiry - now < 60000) {
        this.refreshAuthToken().catch(error => {
          console.error('Auto token refresh failed:', error);
        });
      }
    }, 60000); // Check every minute
  }
  
  /**
   * Log out and invalidate tokens
   */
  async logout() {
    if (this.refreshToken) {
      try {
        await fetch(`${API_BASE_URL}/logout/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`
          },
          body: JSON.stringify({ refresh: this.refreshToken })
        });
      } catch (error) {
        console.error('Logout API call failed:', error);
        // Continue with local logout even if API call fails
      }
    }
    
    // Clear tokens
    this.authToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpiry');
    
    // Clear auth token in storage service
    storageService.clearAuthToken();
    
    // Notify subscribers of authentication state change
    this.notifySubscribers(false);
    
    return { success: true };
  }
  
  /**
   * Check if user is currently authenticated
   */
  isAuthenticated() {
    return !!this.authToken;
  }
  
  /**
   * Verify if current token is valid
   */
  async verifyToken() {
    if (!this.authToken) {
      return { valid: false };
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/token/verify/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: this.authToken })
      });
      
      if (!response.ok) {
        throw new Error(`Token verification failed: ${response.status}`);
      }
      
      return { valid: true };
    } catch (error) {
      console.error('Token verification failed:', error);
      
      // Try refreshing the token if available
      if (this.refreshToken) {
        const refreshResult = await this.refreshAuthToken();
        return { valid: refreshResult.success };
      }
      
      return { valid: false };
    }
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
    this.subscribers.forEach(callback => callback(isAuthenticated));
  }
}

export const authService = new AuthService(); 