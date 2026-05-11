import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, PanelLeft, ChevronLeft, ZoomIn, ZoomOut } from 'lucide-react';
import InfoMenu from './InfoMenu';
import StatsMenu from './StatsMenu';
import { noteContentService } from '../utils/NoteContentService';

const FONT_SIZE_KEY = 'peridot.noteFontSize';
const DEFAULT_FONT_SIZE = 15;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 24;

const getStoredFontSize = () => {
  const raw = localStorage.getItem(FONT_SIZE_KEY);
  const stored = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(stored) || stored < MIN_FONT_SIZE || stored > MAX_FONT_SIZE) {
    return DEFAULT_FONT_SIZE;
  }
  return stored;
};

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
  const [noteFontSize, setNoteFontSize] = useState(getStoredFontSize);

  useEffect(() => {
    document.documentElement.style.setProperty('--md-editor-font-size', `${noteFontSize}px`);
    localStorage.setItem(FONT_SIZE_KEY, String(noteFontSize));
    window.dispatchEvent(new CustomEvent('noteFontSizeChange', { detail: { fontSize: noteFontSize } }));
  }, [noteFontSize]);

  const updateNoteFontSize = (delta) => {
    setNoteFontSize(size => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size + delta)));
  };

  const CustomTooltip = ({ children, content, className='' }) => (
    <div className={`tooltip-container`}>
      {children}
      <span className={`tooltip-content ${className}`}>{content}</span>
    </div>
  );
  
  const selectedNote = notes.find(note => note.id === selectedId);
  
  const noteTitle = useMemo(() => {
    if (selectedNote) {
      const path = [];
      let currentItem = selectedNote;
      
      const currentTitle = currentItem.locked
        ? currentItem.visibleTitle
        : (currentItem.visibleTitle || noteContentService.getFirstLine(currentItem.content));
      path.unshift(currentTitle);

      while (currentItem.parentFolderId) {
        const parentFolder = notes.find(n => n.id === currentItem.parentFolderId);
        if (!parentFolder) break;

        const folderTitle = parentFolder.locked
          ? parentFolder.visibleTitle || 'Untitled'
          : (parentFolder.visibleTitle || noteContentService.getFirstLine(parentFolder.content));
        
        path.unshift(folderTitle);
        currentItem = parentFolder;
      }
  
      return path.join(' > ');
    }
    return '';
  }, [selectedNote?.content, selectedNote?.locked, selectedNote?.visibleTitle, selectedNote?.parentFolderId, notes]);

  return (
    <header>
      <div className="top-bar">
        <div className="header-left">
          <CustomTooltip content="Toggle sidebar">
            <button 
              type="button"
              id="move-menu"
              className="menu-btn"
              onClick={onToggleSidebar}
              style={{cursor: 'pointer'}}
            >
              <PanelLeft />
            </button>
          </CustomTooltip>
          <CustomTooltip content="Previous note">
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
          </CustomTooltip>
          {selectedNote && (
            <div className="note-tab">
              <span className="note-tab-title">{noteTitle}</span>
            </div>
          )}
        </div>
        <div className="header-buttons">
          <CustomTooltip content="Decrease note text size">
            <button
              type="button"
              onClick={() => updateNoteFontSize(-1)}
              disabled={noteFontSize <= MIN_FONT_SIZE}
              aria-label="Decrease note text size"
            >
              <ZoomOut />
            </button>
          </CustomTooltip>
          <CustomTooltip content="Increase note text size">
            <button
              type="button"
              onClick={() => updateNoteFontSize(1)}
              disabled={noteFontSize >= MAX_FONT_SIZE}
              aria-label="Increase note text size"
            >
              <ZoomIn />
            </button>
          </CustomTooltip>
          <CustomTooltip content="View note information">
            <StatsMenu 
              selectedId={selectedId}
              notes={notes}
            />
          </CustomTooltip>
          <CustomTooltip content="Modify note">
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
          </CustomTooltip>
          <CustomTooltip content="Open settings" className={"settings"}>
            <button 
              type="button" 
              id="settings"
              // className="btn btn-settings"
              onClick={onSettingsClick}
            >
              <SlidersHorizontal />
            </button>
          </CustomTooltip>
        </div>
      </div>
    </header>
  );
}

export default React.memo(Header);
