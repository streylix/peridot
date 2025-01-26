import React, { useState, useEffect } from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';
import LockedWindow from './LockedWindow';

function MainContent({ note, onUpdateNote }) {
  const [showLocked, setIsUnlocked] = useState(true);

  useEffect(() => {
    setIsUnlocked(false);
  }, [note?.id]);

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
      {note.locked && showLocked ? (
        <LockedWindow 
          onUnlock={(password) => {
            if (password === note.tempPass) {
              setIsUnlocked(true);
            }
          }} 
        />
      ) : (
        <NoteEditor note={note} onUpdateNote={onUpdateNote} />
      )}
    </div>
  );
}

export default MainContent;