import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

const Section = ({ label, isActive, onClick }) => (
  <button
    className={`section-button ${isActive ? 'active' : ''}`}
    onClick={onClick}
  >
    {label}
  </button>
);

const ItemPresets = {
  TEXT_BUTTON: ({ label, buttonText, onClick }) => (
    <div className="item-preset text-button">
      <span>{label}</span>
      <button onClick={onClick}>{buttonText}</button>
    </div>
  ),
  
  TEXT_SWITCH: ({ label, value, onChange }) => (
    <div className="item-preset text-switch">
      <span>{label}</span>
      <label className="switch">
        <input type="checkbox" checked={value} onChange={onChange} />
        <span className="slider" />
      </label>
    </div>
  ),
  
  TEXT_DROPDOWN: ({ label, value, options, onChange }) => (
    <div className="item-preset text-dropdown">
      <span>{label}</span>
      <select value={value} onChange={onChange}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
  
  ICON_TEXT: ({ icon: Icon, label }) => (
    <div className="item-preset icon-text">
      <Icon />
      <span>{label}</span>
    </div>
  )
};

const Modal = ({ isOpen, onClose, sections = [], title, size = 'default' }) => {
  const [activeSection, setActiveSection] = useState(0);
  const modalRef = useRef(null);
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;

  const showSections = sections.length > 1;
  const activeItems = sections[activeSection]?.items || [];

  return (
      <div className="modal-overlay">
        <div className={`modal-content ${size}`} ref={modalRef}>
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button className="modal-close" onClick={onClose}>
              <X />
            </button>
          </div>
          
          <div className="modal-body">
            {showSections && (
              <div className="modal-sections">
                {sections.map((section, index) => (
                  <Section
                    key={section.label}
                    label={section.label}
                    isActive={index === activeSection}
                    onClick={() => setActiveSection(index)}
                  />
                ))}
              </div>
            )}
            
            <div className="modal-items">
              {activeItems.map((item, index) => (
                <div key={index} className="modal-item">
                  {item.content}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
  );
};

export { Modal, ItemPresets };