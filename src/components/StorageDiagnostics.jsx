import React, { useState } from 'react';
import { ItemComponents, ItemPresets } from './Modal';

const StorageDiagnostics = () => {
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const runDiagnostics = async () => {
    const diagnostics = {
      storageAPI: false,
      getDirectory: false,
      createDirectory: false,
      writeFile: false,
      readFile: false,
    };

    try {
      // Check if storage API exists
      diagnostics.storageAPI = !!navigator.storage;
      console.log("1. Storage API available:", diagnostics.storageAPI);

      // Check if getDirectory works
      try {
        const root = await navigator.storage.getDirectory();
        diagnostics.getDirectory = true;
        console.log("2. Got root directory:", root);

        // Try to create a test directory
        try {
          const testDir = await root.getDirectoryHandle('test-dir', { create: true });
          diagnostics.createDirectory = true;
          console.log("3. Created test directory:", testDir);

          // Try to write a file
          try {
            const fileHandle = await testDir.getFileHandle('test.txt', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write('test content');
            await writable.close();
            diagnostics.writeFile = true;
            console.log("4. Wrote test file");

            // Try to read the file
            try {
              const file = await fileHandle.getFile();
              const content = await file.text();
              diagnostics.readFile = content === 'test content';
              console.log("5. Read test file:", content);

              // Cleanup
              await testDir.removeEntry('test.txt');
              await root.removeEntry('test-dir');
              console.log("6. Cleanup completed");
            } catch (e) {
              console.error("Read failed:", e);
            }
          } catch (e) {
            console.error("Write failed:", e);
          }
        } catch (e) {
          console.error("Create directory failed:", e);
        }
      } catch (e) {
        console.error("Get directory failed:", e);
      }
    } catch (e) {
      setError(e.message);
      console.error("Diagnostics failed:", e);
    }

    try {
      // Check estimated quota
      const estimate = await navigator.storage.estimate();
      diagnostics.quota = {
        usage: Math.round(estimate.usage / 1024 / 1024),
        quota: Math.round(estimate.quota / 1024 / 1024),
        percent: Math.round((estimate.usage / estimate.quota) * 100)
      };
    } catch (e) {
      console.error("Quota check failed:", e);
    }

    setResults(diagnostics);
  };

  return (
    <div className="p-4">
      <ItemPresets.TEXT_BUTTON
        label={results ? "Results:" : (error ? "Error" : "Diagnostics")}
        subtext={
          results ? (
            <div className="space-y-2">
              <div className={`flex items-center gap-2 ${results.storageAPI ? 'text-green-600' : 'text-red-600'}`}>
                ● Storage API: {results.storageAPI ? 'Available' : 'Not Available'}
              </div>
              <div className={`flex items-center gap-2 ${results.getDirectory ? 'text-green-600' : 'text-red-600'}`}>
                ● Get Directory: {results.getDirectory ? 'Working' : 'Failed'}
              </div>
              <div className={`flex items-center gap-2 ${results.createDirectory ? 'text-green-600' : 'text-red-600'}`}>
                ● Create Directory: {results.createDirectory ? 'Working' : 'Failed'}
              </div>
              <div className={`flex items-center gap-2 ${results.writeFile ? 'text-green-600' : 'text-red-600'}`}>
                ● Write File: {results.writeFile ? 'Working' : 'Failed'}
              </div>
              <div className={`flex items-center gap-2 ${results.readFile ? 'text-green-600' : 'text-red-600'}`}>
                ● Read File: {results.readFile ? 'Working' : 'Failed'}
              </div>
              {results.quota && (
                <div className="mt-2">
                  <div className="font-semibold">Storage Usage:</div>
                  <div>Used: {results.quota.usage}MB</div>
                  <div>Total: {results.quota.quota}MB</div>
                  <div>Usage: {results.quota.percent}%</div>
                </div>
              )}
            </div>
          ) : (
            error || "No diagnostics run"
          )
        }
        buttonText="Run Diagnostics"
        onClick={runDiagnostics}
      />
    </div>
  );
}

export default StorageDiagnostics;