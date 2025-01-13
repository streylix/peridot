import React from 'react'

function Header({ onSettingsClick }) {
  return (
    <header>
      <div className="top-bar">
        <button type="button" id="move-menu" className="menu-btn">
          ☰
        </button>
        <h1>mynotes.io</h1>
        <button 
          type="button" 
          className="btn btn-settings"
          onClick={onSettingsClick}
        >
          ⚙️
        </button>
      </div>
    </header>
  )
}

export default Header