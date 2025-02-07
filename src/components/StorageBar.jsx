import React, { useState, useEffect } from 'react';
import { storageService } from '../utils/StorageService';
import { ItemComponents } from './Modal';

const StorageBar = () => {
  const [storageData, setStorageData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStorageData();
  }, []);

  const loadStorageData = async () => {
    try {
      const estimate = await storageService.checkStorageEstimate();
      setStorageData({
        used: estimate.usage,
        total: estimate.quota,
        percentage: (estimate.usage / estimate.quota) * 100
      });
    } catch (error) {
      console.error("Failed to load storage data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!storageData) return <div>No storage data available</div>;

  const formatSize = (bytes) => {
    const gigabytes = bytes / (1024 * 1024 * 1024);
    return `${gigabytes.toFixed(2)} GB`;
  };

  return (
        <ItemComponents.TEXT
          subtext={`${formatSize(storageData.used)} of ${formatSize(storageData.total)} used (${storageData.percentage.toFixed(2)}%)`}
        />
  );
};

export default StorageBar