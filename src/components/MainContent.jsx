import React from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';

function MainContent({ note, onUpdateNote }) {
  if (!note) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <EmptyState />
          </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="title-spacer" style={{ height: '40px' }} />
      <NoteEditor note={note} onUpdateNote={onUpdateNote} />
    </div>
  );
}

export default MainContent;