import React, { useState, useEffect } from 'react';
import { syncService } from '../utils/SyncService';

const SyncBar = () => {
  const [stats, setStats] = useState(syncService.getBackendStorageStats());

  useEffect(() => {
    const updateStats = () => {
      setStats(syncService.getBackendStorageStats());
    };

    // Subscribe to sync status changes
    const unsubscribe = syncService.subscribe(() => {
      updateStats();
    });

    // Update on load
    updateStats();

    return () => {
      unsubscribe();
    };
  }, []);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div>
      <div style={{ width: '100%', backgroundColor: '#e0e0e0', height: '12px', borderRadius: '10px', overflow: 'hidden', marginTop: '8px', marginBottom: '8px' }}>
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