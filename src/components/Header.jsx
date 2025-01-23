import React from 'react';
import { SlidersHorizontal, PanelLeft } from 'lucide-react';
import InfoMenu from './InfoMenu';
import StatsMenu from './StatsMenu';

function Header({ onSettingsClick, selectedId, notes, onTogglePin }) {
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

  return (
    <header>
      <div className="top-bar">
        <button 
          type="button"
          id="move-menu"
          className="menu-btn"
          onClick={toggleSidebar}
        >
          <PanelLeft />
        </button>
        <div className="header-buttons">
          <StatsMenu 
            selectedId={selectedId}
            notes={notes}
          />
          <InfoMenu 
            selectedId={selectedId}
            notes={notes}
            onTogglePin={onTogglePin}
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