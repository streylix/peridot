import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';

function PDFExportModal({ isOpen, onClose, noteTitle, onExport }) {
  const [settings, setSettings] = useState({
    includeTitle: true,
    pageSize: 'letter',
    isLandscape: false,
    margin: 'default',
    scale: 100
  });

  const pageSizeOptions = [
    { value: 'letter', label: 'Letter' },
    { value: 'a4', label: 'A4' },
    { value: 'legal', label: 'Legal' }
  ];

  const marginOptions = [
    { value: 'none', label: 'None' },
    { value: 'small', label: 'Small' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' }
  ];

  const handleExport = () => {
    const marginSizes = {
      none: 0,
      small: 5,
      default: 10,
      large: 20
    };

    const exportSettings = {
      ...settings,
      margin: marginSizes[settings.margin],
      scale: settings.scale / 100
    };

    onExport(exportSettings);
    onClose();
  };

  const sections = [
    {
      items: [
        {
          content: (
            <div className="setting-row">
              <div className="setting-label">
                <span>Include file name as title</span>
                <span className="setting-subtext">Add "{noteTitle}" as the document title</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.includeTitle}
                  onChange={(e) => setSettings({ ...settings, includeTitle: e.target.checked })}
                />
                <span className="slider" />
              </label>
            </div>
          )
        },
        {
          content: (
            <div className="setting-row">
              <div className="setting-label">
                <span>Page size</span>
              </div>
              <select
                value={settings.pageSize}
                onChange={(e) => setSettings({ ...settings, pageSize: e.target.value })}
                className="select-input"
              >
                {pageSizeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )
        },
        {
          content: (
            <div className="setting-row">
              <div className="setting-label">
                <span>Landscape</span>
                <span className="setting-subtext">Use landscape orientation</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.isLandscape}
                  onChange={(e) => setSettings({ ...settings, isLandscape: e.target.checked })}
                />
                <span className="slider" />
              </label>
            </div>
          )
        },
        {
          content: (
            <div className="setting-row">
              <div className="setting-label">
                <span>Margin</span>
              </div>
              <select
                value={settings.margin}
                onChange={(e) => setSettings({ ...settings, margin: e.target.value })}
                className="select-input"
              >
                {marginOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )
        },
        {
          content: (
            <div className="setting-row">
              <div className="setting-label">
                <span>Scale</span>
                <span className="setting-subtext">Adjust the content size</span>
              </div>
              <div className="scale-control">
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={settings.scale}
                  onChange={(e) => setSettings({ ...settings, scale: parseInt(e.target.value) })}
                  className="range-input"
                />
                <span className="scale-value">{settings.scale}%</span>
              </div>
            </div>
          )
        },
        {
          content: (
            <div className="setting-row">
              <button 
                onClick={handleExport}
                className="export-button"
              >
                Export to PDF
              </button>
            </div>
          )
        }
      ]
    }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      sections={sections}
      title="Export to PDF"
      size="small"
    />
  );
}

export default PDFExportModal;