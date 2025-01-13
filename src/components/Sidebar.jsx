import React from 'react'

function Sidebar() {
  return (
    <div className="sidebar" id="sidebar">
      <div className="search">
        <label htmlFor="search">🔍</label>
        <input 
          type="search" 
          name="search" 
          id="note-search" 
          placeholder="Search..." 
        />
      </div>
      <button type="button" className="new-note-btn">
        + New Note
      </button>
      <ul className="note-list">
        {/* Note items will go here */}
      </ul>
      <button type="button" id="debug-button">
        Clear All Notes (Debug)
      </button>
    </div>
  )
}

export default Sidebar