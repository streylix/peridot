import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';
import { ItemComponents, ItemPresets } from './Modal';

function PDFExportModal({ isOpen, onClose, noteTitle, onExport }) {
  const [settings, setSettings] = useState({
    includeTitle: true,
    pageSize: 'letter',
    isLandscape: false,
    margin: 'default',
    scale: 100
  });

  const [isSliding, setIsSliding] = useState(false);
  const sliderRef = useRef(null);

  useEffect(() => {
    if (sliderRef.current) {
      const min = parseFloat(sliderRef.current.min);
      const max = parseFloat(sliderRef.current.max);
      const val = parseFloat(sliderRef.current.value);
      const percentage = ((val - min) / (max - min)) * 100;
      sliderRef.current.style.setProperty('--slider-value', `${percentage}%`);
    }
  }, [settings.scale]);

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

  const handleScaleChange = (e) => {
    const newScale = parseInt(e.target.value);
    setSettings({ ...settings, scale: newScale });
  };

  const sections = [
    {
      items: [
        {
          content: (
            <ItemComponents.SUBSECTION
            title={"Export to PDF"}
            children={[  
              <ItemPresets.TEXT_SWITCH
                label={"Include File Name As Title"}
                value={settings.includeTitle}
                onChange={(e) => setSettings({ ...settings, includeTitle: e.target.checked })}
              />,
              <ItemPresets.TEXT_DROPDOWN
                label={"Page size"}
                value={settings.pageSize}
                options={pageSizeOptions}
                onChange={(value) => setSettings({ ...settings, pageSize: value })}
              />,
              <ItemPresets.TEXT_SWITCH
                label={"Landscape"}
                value={settings.isLandscape}
                onChange={(e) => setSettings({ ...settings, isLandscape: e.target.checked })}
              />,
              <ItemPresets.TEXT_DROPDOWN
                label={"Margin"}
                value={settings.margin}
                options={marginOptions}
                onChange={(value) => setSettings({ ...settings, margin: value })}
              />,
              <ItemComponents.CONTAINER
                children={[
                  <ItemComponents.TEXT
                    label={"Scale"}
                    subtext={"Adjust the content size (Currently unavailable)"}
                  />,
                  <input
                    disabled
                    ref={sliderRef}
                    type="range"
                    min="10"
                    max="100"
                    value={settings.scale}
                    onChange={handleScaleChange}
                    className={`range-input ${isSliding ? 'sliding' : ''}`}
                    data-value={settings.scale}
                    onMouseDown={() => setIsSliding(true)}
                    onMouseUp={() => setIsSliding(false)}
                    onMouseLeave={() => setIsSliding(false)}
                  />,
                  <div className="scale-value-container">
                    <ItemComponents.TEXT
                      label={`${settings.scale}%`}
                    />
                  </div>,
                ]}
              />,
              <ItemComponents.BUTTON
                primary="primary"
                onClick={handleExport}
              >
                Export to PDF
              </ItemComponents.BUTTON>
            ]}
            />
          )
        },
      ]
    }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      sections={sections}
      title="Export to PDF"
      size="medium"
    />
  );
}

export default PDFExportModal;