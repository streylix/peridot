import React, { useState, useEffect, useRef } from 'react';
import { syncService } from '../utils/SyncService';

// We no longer need the shared cache since WebSockets provide real-time updates
const SyncBar = ({ used = 0, total = 100 * 1024 * 1024 }) => {
  const [stats, setStats] = useState({
    used: used,
    total: total,
    available: total - used,
    percentUsed: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  });
  const isComponentMounted = useRef(true);
  
  // Function to safely update stats only if component is mounted
  const safeSetStats = (newStats) => {
    if (isComponentMounted.current) {
      setStats(newStats);
    }
  };

  useEffect(() => {
    // Set mounted flag
    isComponentMounted.current = true;
    
    // Subscribe to sync status changes from WebSocket
    const unsubscribe = syncService.subscribe(() => {
      // Get latest stats (which are updated by WebSocket)
      const currentStats = syncService.getBackendStorageStats();
      safeSetStats(currentStats);
    });

    // Initial stats load
    const currentStats = syncService.getBackendStorageStats();
    safeSetStats(currentStats);

    // No need for polling - WebSocket will provide updates

    // Cleanup function
    return () => {
      isComponentMounted.current = false;
      unsubscribe();
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