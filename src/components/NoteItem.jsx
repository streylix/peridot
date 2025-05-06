import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { Pin, Lock, RefreshCw, Check, X } from 'lucide-react';
import { noteContentService } from '../utils/NoteContentService';
import { syncService } from '../utils/SyncService';

const NoteItem = React.memo(({
  note,
  depth = 0,
  isSelected,
  onNoteSelect,
  onContextMenu
}) => {
  const [syncStatus, setSyncStatus] = useState({ status: 'not-synced' });

  useEffect(() => {
    // Get initial sync status
    const status = syncService.getSyncStatus(note.id);
    setSyncStatus(status);

    // Subscribe to sync status changes
    const unsubscribe = syncService.subscribe((noteId, status) => {
      if (noteId === note.id || noteId === null) {
        // When noteId is null, it's a global update, so refresh our status
        setSyncStatus(noteId === null ? syncService.getSyncStatus(note.id) : status);
      }
    });

    // Also listen for the custom event for cross-tab updates
    const handleSyncUpdate = (event) => {
      if (event.detail.noteId === note.id) {
        setSyncStatus(event.detail.status);
      }
    };
    window.addEventListener('syncStatusUpdate', handleSyncUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener('syncStatusUpdate', handleSyncUpdate);
    };
  }, [note.id]);

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

  const renderSyncIcon = () => {
    if (!syncStatus || syncStatus.status === 'not-synced') return null;

    switch (syncStatus.status) {
      case 'syncing':
        return <RefreshCw size={14} className="sync-indicator syncing" />;
      case 'synced':
        return <Check size={14} className="sync-indicator synced" />;
      case 'failed':
        return <X size={14} className="sync-indicator failed" />;
      default:
        return null;
    }
  };

  const syncIcon = renderSyncIcon();

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
          <span className="note-title">
            {syncIcon && (
              <span className="sync-icon-wrapper">
                {syncIcon}
              </span>
            )}
            {title}
          </span>
          <div className="note-preview">{preview}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {note.pinned && <Pin size={20} className="pin-indicator" />}
          {note.locked && <Lock size={20} className="lock-indicator" />}
        </div>
      </div>
      <style jsx>{`
        .sync-icon-wrapper {
          display: inline-flex;
          align-items: center;
          margin-right: 4px;
          vertical-align: middle;
        }
        
        .sync-indicator.syncing {
          animation: spin 1.5s linear infinite;
          color: #1890ff;
        }
        
        .sync-indicator.synced {
          color: #52c41a;
        }
        
        .sync-indicator.failed {
          color: #ff4d4f;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </li>
  );
});

export default NoteItem;