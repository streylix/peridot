import React, { useState, useEffect } from 'react';
import NoteEditor from './NoteEditor';
import EmptyState from './EmptyState';
import LockedWindow from './LockedWindow';

function MainContent({ note, onUpdateNote, gifToAdd, onGifAdded }) {
  const [showLocked, setIsUnlocked] = useState(true);
  const [showContent, setTempUnlock] = useState(false);

  const handleUnlock = (password) => {
    if (password === note.tempPass) {
      setTempUnlock(true);
      return true;
    }
    return false;
  };

  useEffect(() => {
    setTempUnlock(false);
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
      {note.locked && !showContent ? (
        <LockedWindow onUnlock={handleUnlock}/>
      ) : (
        <NoteEditor 
        note={note}
        onUpdateNote={onUpdateNote}
        gifToAdd={gifToAdd} 
        onGifAdded={onGifAdded}
        />
      )}
    </div>
  );
}

export default MainContent;