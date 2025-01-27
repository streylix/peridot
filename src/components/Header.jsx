import React from 'react';
import { SlidersHorizontal, PanelLeft, ChevronLeft, Bug } from 'lucide-react';
import InfoMenu from './InfoMenu';
import StatsMenu from './StatsMenu';

function getFirstLine(content) {
  if (!content) return 'Untitled';
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  
  const childNodes = Array.from(tempDiv.childNodes);
  
  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) return text;
    }
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent.trim();
      if (text) return text;
    }
  }
  
  return 'Untitled';
}

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
  onUnlockModalOpen 
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
  const noteTitle = selectedNote ? getFirstLine(selectedNote.content) : '';

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

export default Header;