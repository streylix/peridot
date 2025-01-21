import React from 'react';

function InfoPanel({ note }) {
  if (!note) return null;

  const created = new Date(note.id).toLocaleString(); // Using ID as creation timestamp
  const modified = new Date(note.dateModified).toLocaleString();

  return (
    <div className="info-panel">
      <h3>Note Information</h3>
      <div className="info-item">
        <label>Created:</label>
        <span>{created}</span>
      </div>
      <div className="info-item">
        <label>Modified:</label>
        <span>{modified}</span>
      </div>
    </div>
  );
}

// Add CSS
const styles = `
.info-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  background: #1e1e1e;
  border: 1px solid #333;
  padding: 15px;
  border-radius: 8px;
  color: #c7c7c7;
  font-size: 0.9em;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
}

.info-item {
  margin: 10px 0;
  display: flex;
  justify-content: space-between;
  gap: 20px;
}

.info-item label {
  color: #888;
}
`;