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



const ItemComponents = {
    CONTAINER: ({ children, className }) => {
        const [left, ...right] = React.Children.toArray(children);
        return (
          <div className="modal-side-split">
            <div className="modal-side-split-left">{left}</div>
            <div className="modal-side-split-right">{right}</div>
          </div>
        );
      },
    
    BUTTON: ({ onClick, primary, children }) => (
      <div className="spacer">
        <button className={primary} onClick={onClick}>{children}</button>
      </div>
    ),
    
    SWITCH: ({ value, onChange = () => {} }) => (
      <label className="switch">
        <input type="checkbox" checked={value} onChange={onChange} />
        <span className="slider" />
      </label>
    ),
    
    DROPDOWN: ({ value, options, onChange = () => {} }) => (
        <select 
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ),
    
    TEXT: ({ label, subtext }) => (
      <div className="item-text">
        <span className="item-text-primary">{label}</span>
        {subtext && <span className="item-text-secondary">{subtext}</span>}
      </div>
    ),
    
    ICON: ({ icon: Icon, size = 20 }) => <Icon size={size} />,
    
    SUBSECTION: ({ title, children }) => (
      <div className="item-subsection">
        <h3 className="item-subsection-title">{title}</h3>
        {children}
      </div>
    )
  };
  
  const ItemPresets = {
    TEXT_BUTTON: ({ label, subtext, buttonText, onClick, primary }) => (
      <ItemComponents.CONTAINER>
        <ItemComponents.TEXT label={label} subtext={subtext} />
        <ItemComponents.BUTTON onClick={onClick} primary={primary}>{buttonText}</ItemComponents.BUTTON>
      </ItemComponents.CONTAINER>
    ),
  
    TEXT_SWITCH: ({ label, subtext, value, onChange = () => {} }) => (
      <ItemComponents.CONTAINER>
        <ItemComponents.TEXT label={label} subtext={subtext} />
        <ItemComponents.SWITCH value={value} onChange={onChange} />
      </ItemComponents.CONTAINER>
    ),
  
    TEXT_DROPDOWN: ({ label, value, options, onChange = () => {} }) => (
      <ItemComponents.CONTAINER>
        <ItemComponents.TEXT label={label} />
        <ItemComponents.DROPDOWN value={value} options={options} onChange={onChange} />
      </ItemComponents.CONTAINER>
    ),
  
    ICON_TEXT: ({ icon, label, subtext }) => (
      <ItemComponents.CONTAINER>
        <ItemComponents.ICON icon={icon} />
        <ItemComponents.TEXT label={label} subtext={subtext} />
      </ItemComponents.CONTAINER>
    ),
  
    SUBSECTION: ItemComponents.SUBSECTION
  };

const Modal = ({ isOpen, onClose, sections = [], title, size = 'default', className = ''}) => {
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
        <button className="modal-close" onClick={onClose}>
            <X />
        </button>
        <div className={`modal-content ${size}`} ref={modalRef}>
          <div className="modal-main">
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
            
            <div className="modal-body">
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

export { Modal, ItemPresets, ItemComponents };