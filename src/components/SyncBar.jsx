import React, { useState, useEffect, useRef } from 'react';
import { syncService } from '../utils/SyncService';

// Create a shared cache outside component to avoid multiple fetches
let lastFetchTime = 0;
let cachedStats = null;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache

const SyncBar = ({ used = 0, total = 100 * 1024 * 1024 }) => {
  const [stats, setStats] = useState({
    used: used,
    total: total,
    available: total - used,
    percentUsed: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  });
  const isComponentMounted = useRef(true);
  const updateTimeoutRef = useRef(null);
  
  // Function to safely update stats only if component is mounted
  const safeSetStats = (newStats) => {
    if (isComponentMounted.current) {
      setStats(newStats);
    }
  };

  // Debounced function to avoid multiple backend calls
  const fetchStorageInfo = async () => {
    // Check if we have a recent cached value
    const now = Date.now();
    if (cachedStats && now - lastFetchTime < CACHE_DURATION) {
      safeSetStats(cachedStats);
      return;
    }
    
    try {
      // Fetch latest stats from backend
      await syncService.fetchBackendStorageInfo();
      const currentStats = syncService.getBackendStorageStats();
      
      // Update cache
      cachedStats = currentStats;
      lastFetchTime = now;
      
      // Update component state
      safeSetStats(currentStats);
    } catch (error) {
      console.error('Failed to update storage stats:', error);
    }
  };

  useEffect(() => {
    // Set mounted flag
    isComponentMounted.current = true;
    
    // Function to update stats with debouncing
    const updateStats = () => {
      // Clear any existing timeout to prevent multiple calls
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      // Set a small timeout to debounce rapid calls
      updateTimeoutRef.current = setTimeout(fetchStorageInfo, 100);
    };

    // Subscribe to sync status changes - these should be infrequent
    const unsubscribe = syncService.subscribe(() => {
      updateStats();
    });

    // Update on initial load
    updateStats();

    // Set up periodic refresh (every 2 minutes)
    const refreshInterval = setInterval(updateStats, 2 * 60 * 1000);

    // Cleanup function
    return () => {
      isComponentMounted.current = false;
      unsubscribe();
      clearInterval(refreshInterval);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Update stats when props change
  useEffect(() => {
    if (used !== stats.used || total !== stats.total) {
      setStats({
        used: used,
        total: total,
        available: total - used,
        percentUsed: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
      });
    }
  }, [used, total, stats.used, stats.total]);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    if (isNaN(bytes)) return 'Unknown';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.max(1, bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div>
      <div style={{ width: '100%', backgroundColor: '#3a3a3a', height: '12px', borderRadius: '10px', overflow: 'hidden', marginTop: '8px', marginBottom: '8px' }}>
        <div
          style={{
            width: `${stats.percentUsed}%`,
            backgroundColor: stats.percentUsed > 90 ? '#ff4d4f' : '#0aa34f',
            height: '100%',
            borderRadius: '10px',
            transition: 'width 0.3s ease'
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999' }}>
        <span>Used: {formatSize(stats.used)}</span>
        <span>Available: {formatSize(stats.available)}</span>
      </div>
    </div>
  );
};

export default SyncBar; 