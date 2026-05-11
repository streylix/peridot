import { useState } from 'react';
import { Modal } from './Modal';
import { ItemComponents, ItemPresets } from './Modal';

function PDFExportModal({ isOpen, onClose, onExport }) {
  const [settings, setSettings] = useState({
    includeTitle: true,
    pageSize: 'letter',
    isLandscape: false,
    margin: 'default'
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
      scale: 1
    };

    onExport(exportSettings);
    onClose();
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
                key="include-title"
                label={"Include File Name As Title"}
                value={settings.includeTitle}
                onChange={(e) => setSettings({ ...settings, includeTitle: e.target.checked })}
              />,
              <ItemPresets.TEXT_DROPDOWN
                key="page-size"
                label={"Page size"}
                value={settings.pageSize}
                options={pageSizeOptions}
                onChange={(value) => setSettings({ ...settings, pageSize: value })}
              />,
              <ItemPresets.TEXT_SWITCH
                key="landscape"
                label={"Landscape"}
                value={settings.isLandscape}
                onChange={(e) => setSettings({ ...settings, isLandscape: e.target.checked })}
              />,
              <ItemPresets.TEXT_DROPDOWN
                key="margin"
                label={"Margin"}
                value={settings.margin}
                options={marginOptions}
                onChange={(value) => setSettings({ ...settings, margin: value })}
              />,
              <ItemComponents.BUTTON
                key="export-btn"
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
