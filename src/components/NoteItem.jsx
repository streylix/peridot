import React, { useMemo, useCallback } from 'react';
import { Pin, Lock } from 'lucide-react';

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

  const getPreviewFromMarkdown = (content) => {
    if (!content) return '';
    
    // Remove headers
    let preview = content.replace(/^#+\s+.*$/gm, '');
    
    // Remove images
    preview = preview.replace(/!\[.*?\]\(.*?\)/g, '');
    
    // Remove links but keep text
    preview = preview.replace(/\[(.*?)\]\(.*?\)/g, '$1');
    
    // Remove code blocks
    preview = preview.replace(/```[\s\S]*?```/g, '');
    
    // Remove inline code
    preview = preview.replace(/`.*?`/g, '');
    
    // Remove emphasis markers but keep text
    preview = preview.replace(/\*\*(.*?)\*\*/g, '$1');
    preview = preview.replace(/\*(.*?)\*/g, '$1');
    preview = preview.replace(/__(.*?)__/g, '$1');
    preview = preview.replace(/_(.*?)_/g, '$1');
    
    // Remove blockquotes
    preview = preview.replace(/^\s*>\s*/gm, '');
    
    // Remove horizontal rules
    preview = preview.replace(/^-{3,}|={3,}|\*{3,}$/gm, '');
    
    // Clean up extra whitespace
    preview = preview.replace(/\n\s+/g, '\n').trim();
    
    // Get first non-empty line for title and remaining for preview
    const lines = preview.split('\n').filter(line => line.trim());
    const title = lines[0] || 'Untitled';
    const previewText = lines.slice(1).join(' ').trim();
    
    return { title, preview: previewText };
  };

  const { title, preview } = useMemo(() => {
    if (note.locked && note.visibleTitle) {
      return {
        title: note.visibleTitle,
        preview: 'Note is locked'
      };
    }
    return getPreviewFromMarkdown(note.content);
  }, [note.content, note.locked, note.visibleTitle]);

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
      onContextMenu={handleContextMenu}
      onClick={handleClick}
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