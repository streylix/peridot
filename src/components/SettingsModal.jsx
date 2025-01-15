import React from 'react'

function SettingsModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div className="modal fade show" 
      style={{ display: 'block' }} 
      role="dialog"
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Other Settings</h5>
            <button 
              type="button" 
              className="close" 
              onClick={onClose}
            >
              <span>&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <p>More settings coming soon!</p>
          </div>
          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-danger" 
              disabled
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal