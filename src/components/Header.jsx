import React, { useMemo } from 'react';
import { SlidersHorizontal, PanelLeft, ChevronLeft, Bug } from 'lucide-react';
import InfoMenu from './InfoMenu';
import StatsMenu from './StatsMenu';
import { noteContentService } from '../utils/NoteContentService';

function Header({ 
  onSettingsClick, 
  selectedId, 
  notes, 
  onTogglePin, 
  onDeleteNote, 
  onBack, 
  canGoBack, 
  onDebugClick, 
  onGifModalOpen,
  isDownloadable,
  setDownloadable,
  setDownloadNoteId,
  setPdfExportNote,
  setIsPdfExportModalOpen,
  onToggleSidebar,
}) {

  const selectedNote = notes.find(note => note.id === selectedId);
  const noteTitle = useMemo(() => {
    if (selectedNote) {
      if (selectedNote.locked) {
        // Use the visibleTitle property for locked notes
        return selectedNote.visibleTitle || 'Untitled';
      } else {
        // Use the first line of the note content for unlocked notes
        return noteContentService.getFirstLine(selectedNote.content);
      }
    }
    return '';
  }, [selectedNote?.content, selectedNote?.locked, selectedNote?.visibleTitle]);

  return (
    <header>
      <div className="top-bar">
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <button 
            type="button"
            id="move-menu"
            className="menu-btn"
            onClick={onToggleSidebar}
            style={{cursor: 'pointer'}}
          >
            <PanelLeft />
          </button>
          <button
            type="button"
            id="back-btn"
            data-testid="back-btn"
            onClick={onBack}
            disabled={!canGoBack}
            onMouseEnter={e => canGoBack && (e.target.style.opacity = '1')} 
            onMouseLeave={e => canGoBack && (e.target.style.opacity = '0.6')}
            style={{ opacity: canGoBack ? 0.6 : 0.3, cursor: canGoBack ? 'pointer' : 'not-allowed' }}
          >
            <ChevronLeft />
          </button>
          {selectedNote && (
            <div className="note-tab">
              <span className="note-tab-title">{noteTitle}</span>
            </div>
          )}
        </div>
        <div className="header-buttons">
          {/* <button onClick={onDebugClick}>
            <Bug />
          </button> */}
          <StatsMenu 
            selectedId={selectedId}
            notes={notes}
          />
          <InfoMenu 
            selectedId={selectedId}
            notes={notes}
            onTogglePin={onTogglePin}
            onDeleteNote={onDeleteNote}
            onGifModalOpen={onGifModalOpen}
            isDownloadable={isDownloadable}
            setPdfExportNote={setPdfExportNote}
            setIsPdfExportModalOpen={setIsPdfExportModalOpen}
          />
          <button 
            type="button" 
            id="settings"
            className="btn btn-settings"
            onClick={onSettingsClick}
          >
            <SlidersHorizontal />
          </button>
        </div>
      </div>
    </header>
  );
}

export default React.memo(Header);