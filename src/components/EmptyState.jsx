import React from 'react';

function EmptyState() {
  return (
    <div
      style={{
        position: 'absolute',
        top: '45px',
        right: 0,
        bottom: 0,
        width: 'calc(100%)',
        background: '#1e1e1e',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'width 0.3s ease-out',
        opacity: 0.1,
        userSelect: 'none'
      }}
      className="empty-window main-content"
    >
      <h1 className="empty-main">No file is open</h1>
    </div>
  );
}

export default EmptyState;