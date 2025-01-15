import React from 'react'

function Header({ onSettingsClick, onDarkModeClick }) {
  const toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (sidebar && mainContent) {
      sidebar.classList.toggle('hidden');
      mainContent.classList.toggle('full-width');
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
        <h1>peridot</h1>
        <div className="header-buttons">
          <button 
            type="button" 
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