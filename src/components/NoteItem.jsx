import React, { useMemo, useCallback } from 'react';
import { Pin, Lock } from 'lucide-react';
import { noteContentService } from '../utils/NoteContentService';

const NoteItem = React.memo(({
  note,
  depth = 0,
  isSelected,
  onNoteSelect,
  onContextMenu
}) => {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: note.id,
      type: 'note'
    }));
  };

  const title = useMemo(() => {
    if (note.locked && note.visibleTitle) {
      return note.visibleTitle;
    }
    note.visibleTitle = noteContentService.getFirstLine(note.content)
    return note.visibleTitle;
  }, [note.content, note.locked, note.visibleTitle]);

  const preview = useMemo(() => {
    if (note.locked) {
      return 'Unlock to view';
    }
    return noteContentService.getPreviewContent(note.content);
  }, [note.content, note.locked]);

  const handleClick = useCallback(() => {
    onNoteSelect(note.id);
  }, [note.id, onNoteSelect]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    onContextMenu(e, note.id);
  }, [note.id, onContextMenu]);

  return (
    <li
      className={`note-item ${isSelected ? 'active' : ''}`}
      style={{ marginLeft: `${depth * 40}px` }}
      draggable
      onDragStart={handleDragStart}
      onContextMenu={(e) => onContextMenu(e, note.id)}
      onClick={() => onNoteSelect(note.id)}
    >
      <div className="note-header">
        <div className="item-text" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="note-title">{title}</span>
          <div className="note-preview">{preview}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {note.pinned && <Pin size={20} className="pin-indicator" />}
          {note.locked && <Lock size={20} className="lock-indicator" />}
        </div>
      </div>
    </li>
  );
});

export default NoteItem;