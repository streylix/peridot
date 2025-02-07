import React, { useState, useEffect } from 'react';
import { storageService } from '../utils/StorageService';

const StorageAnalyzer = () => {
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = async () => {
    try {
      setLoading(true);
      console.log("getting info?")
      const available = await storageService.checkOPFSAvailability();
      console.log("OPFS available:", available);
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

  if (loading) return <div className="p-4">Loading storage information...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (!storageInfo) return <div className="p-4">No storage information available</div>;

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">OPFS Storage Information</h2>
        <p className="text-gray-600">Total Size: {storageInfo.totalSizeInKB} KB</p>
        <p className="text-gray-600">Number of Files: {storageInfo.entries.length}</p>
      </div>

      <div className="overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Filename</th>
              <th className="p-2 text-center">Size</th>
              <th className="p-2 text-left">Last Modified</th>
              <th className="p-2 text-left">Content Preview</th>
            </tr>
          </thead>
          <tbody>
            {storageInfo.entries.map((entry, index) => (
              <tr key={index} className="border-t">
                <td className="p-2">{entry.name}</td>
                <td className="p-2 text-center">{entry.size ? formatBytes(entry.size) : 'N/A'}</td>
                <td className="p-2">
                  {entry.lastModified ? entry.lastModified.toLocaleString() : 'N/A'}
                </td>
                <td className="p-2">
                  {entry.error ? (
                    <span className="text-red-500">Error: {entry.error}</span>
                  ) : (
                    <div className="max-h-20 overflow-auto">
                      <pre className="text-xs">
                        {JSON.stringify(entry.content, null, 2).slice(0, 150)}...
                      </pre>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={loadStorageInfo}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Refresh Storage Info
      </button>
    </div>
  );
};

export default StorageAnalyzer;