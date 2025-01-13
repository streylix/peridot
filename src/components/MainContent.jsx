import React from 'react'
import NoteToolbar from './NoteToolbar'

function MainContent() {
  return (
    <div className="main-content" id="main-content">
      <NoteToolbar />
      <div 
        className="editable" 
        id="editable"
        contentEditable
        suppressContentEditableWarning={true}
        placeholder="Select a note to start editing..."
      />
    </div>
  )
}

export default MainContent
