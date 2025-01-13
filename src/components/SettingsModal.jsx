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
            <h5 className="modal-title">Settings</h5>
            <button 
              type="button" 
              className="close" 
              onClick={onClose}
            >
              <span>&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <ul className="nav nav-pills flex-column">
              <li className="nav-item">
                <a className="nav-link active">Appearance</a>
              </li>
            </ul>
            <div className="tab-content">
              <div className="tab-pane fade show active">
                <div className="custom-control custom-switch">
                  <input 
                    type="checkbox" 
                    className="custom-control-input" 
                    id="darkModeSwitch" 
                  />
                  <label 
                    className="custom-control-label" 
                    htmlFor="darkModeSwitch"
                  >
                    Dark Mode
                  </label>
                </div>
              </div>
            </div>
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