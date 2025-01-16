import React from 'react'

function Header({ onSettingsClick, onDarkModeClick }) {
  const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const topBar = document.querySelector('.top-bar');
    const header = document.querySelector('header')
    
    if (sidebar && mainContent && header && topBar) {
      sidebar.classList.toggle('hidden');
      mainContent.classList.toggle('full-width');
      topBar.classList.toggle('full-width');
      header.classList.toggle('full-width')
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
          ☰
        </button>
        <div className="header-buttons">
          <button 
            type="button" 
            id="settings"
            className="btn btn-settings"
            onClick={onSettingsClick}
          >
            ⚙️
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header