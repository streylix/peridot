import React, { useState, useEffect } from 'react';
import { storageService } from '../utils/StorageService';
import { ItemComponents } from './Modal';

const StorageAnalyzer = () => {
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isStorageInfoVisible, setIsStorageInfoVisible] = useState(() =>
    localStorage.getItem('isStorageInfoVisible') === 'true'
  );

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = async () => {
    try {
      setLoading(true);
      const available = await storageService.checkOPFSAvailability();
      const info = await storageService.getStorageInfo();
      setStorageInfo(info);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    return (bytes / 1024).toFixed(2) + ' KB';
  };

  const getFileType = (filename) => {
    const ext = filename.split('.').pop();
    return ext.toUpperCase();
  };

  const formatContentPreview = (content) => {
    // Handle encrypted content (array of numbers)
    if (Array.isArray(content)) {
      return content.length > 0 
        ? `[${content[0]}, ${content[1]}, ...] (${content.length} items)` 
        : 'Empty Array';
    }

    // Handle JSON content
    if (typeof content === 'object') {
      return JSON.stringify(content, null, 0)
        .replace(/\n/g, ' ')
        .slice(0, 80) + '...';
    }

    // Handle string content
    return content ? content.slice(0, 80) + '...' : 'No content';
  };

  const handleIsStorageInfoVisible = (event) => {
    const newValue = event.target.checked;
    setIsStorageInfoVisible(newValue);
    localStorage.setItem('isStorageInfoVisible', newValue);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (loading) return <div className="p-4">Loading storage information...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (!storageInfo) return <div className="p-4">No storage information available</div>;

  return (
    <div className="p-4">
      <ItemComponents.CONTAINER 
        children={[
          <ItemComponents.TEXT
            label={'OPFS Storage Information'}
            subtext={`Total Size: ${storageInfo.totalSizeInKB} KB | Number of Files: ${storageInfo.entries.length}`}
          />,
            <ItemComponents.BUTTON
              onClick={loadStorageInfo}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Refresh Storage Info
            </ItemComponents.BUTTON>,
            <ItemComponents.SWITCH
              value={isStorageInfoVisible}
              onChange={handleIsStorageInfoVisible}
            />
        ]}
      />
      {isStorageInfoVisible && (
        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-center">File Type</th>
                <th className="p-2 text-center">Size</th>
                <th className="p-2 text-center">Last Modified</th>
                <th className="p-2 text-center">Content Preview</th>
              </tr>
            </thead>
            <tbody>
              {storageInfo.entries.map((entry, index) => (
                <tr key={index} className="border-t">
                  <td className="p-2 text-center">{getFileType(entry.name)}</td>
                  <td className="p-2 text-center">{entry.size ? formatBytes(entry.size) : 'N/A'}</td>
                  <td className="p-2 text-center">
                    {formatDate(entry.lastModified)}
                  </td>
                  <td className="p-2">
                    <div 
                      className="max-h-20 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{ maxWidth: '300px' }}
                    >
                      {entry.error ? (
                        <span className="text-red-500">Error: {entry.error}</span>
                      ) : (
                        <span className="text-xs">
                          {formatContentPreview(entry.content)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StorageAnalyzer;