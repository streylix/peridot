import React, { useMemo } from 'react';
import { SlidersHorizontal, PanelLeft, ChevronLeft, Bug } from 'lucide-react';
import InfoMenu from './InfoMenu';
import StatsMenu from './StatsMenu';
import { getFirstLine } from '../utils/contentUtils';

function Header({ 
  onSettingsClick, 
  selectedId, 
  notes, 
  onTogglePin, 
  onDeleteNote, 
  onBack, 
  canGoBack, 
  onDebugClick, 
  onLockModalOpen, 
  onUnlockModalOpen,
  onGifModalOpen
}) {
  const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const topBar = document.querySelector('.top-bar');
    const header = document.querySelector('header');
    
    if (sidebar && mainContent && header && topBar) {
      sidebar.classList.toggle('hidden');
      mainContent.classList.toggle('full-width');
      topBar.classList.toggle('full-width');
      header.classList.toggle('full-width');
    }
  };

  const selectedNote = notes.find(note => note.id === selectedId);
  const noteTitle = useMemo(() => 
    selectedNote ? getFirstLine(selectedNote.content) : '',
    [selectedNote?.content]
  );

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
            onClick={toggleSidebar}
            style={{cursor: 'pointer'}}
          >
            <PanelLeft />
          </button>
          <button
            type="button"
            id="back-btn"
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
          <button onClick={onDebugClick}>
            <Bug />
          </button>
          <StatsMenu 
            selectedId={selectedId}
            notes={notes}
          />
          <InfoMenu 
            selectedId={selectedId}
            notes={notes}
            onTogglePin={onTogglePin}
            onDeleteNote={onDeleteNote}
            onLockModalOpen={onLockModalOpen}
            onUnlockModalOpen={onUnlockModalOpen}
            onGifModalOpen={onGifModalOpen}
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