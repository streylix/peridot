import React from 'react'

function NoteToolbar() {
  return (
    <div className="note-toolbar">
      <button type="button" id="blob-export-btn">⬇️</button>
      <button type="button" id="gif-note-btn">🎁</button>
      <button type="button" id="lock-note-btn">🔐</button>
      <button type="button" id="embed-link-btn">🔗</button>
      <button type="button" id="pin-note-btn">📌</button>
      <button type="button" id="delete-selected-note-btn">🗑</button>
    </div>
  )
}

export default NoteToolbar