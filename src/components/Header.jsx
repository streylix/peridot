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
      
      // Get the current note's title
      const currentTitle = currentItem.locked ? 
        currentItem.visibleTitle : 
        (currentItem.content ? 
          (currentItem.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || currentItem.visibleTitle) : 
          'Untitled'
        );
      path.unshift(currentTitle);
  
      // Traverse up through parent folders
      while (currentItem.parentFolderId) {
        const parentFolder = notes.find(n => n.id === currentItem.parentFolderId);
        if (!parentFolder) break;
  
        const folderTitle = parentFolder.content ? 
          (parentFolder.content.match(/<div[^>]*>(.*?)<\/div>/)?.[1] || parentFolder.visibleTitle) : 
          'Untitled';
        
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
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
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
          {/* <button onClick={onDebugClick}>
            <Bug />
          </button> */}
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