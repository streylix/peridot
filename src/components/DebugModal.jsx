import React, { useState } from 'react';
import { Modal, ItemPresets } from './Modal';
import { Lock, Globe, Bell, Keyboard, Code, Database, Cloud } from 'lucide-react';

function DebugModal({ currentModal, onClose }) {
  const [switches, setSwitches] = useState({
    switch1: false,
    switch2: true,
    switch3: false
  });

  const smallModalSections = [{
    items: [{
      content: (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm">Username</label>
            <input className="w-full p-2 bg-gray-700 rounded-md" type="text" />
          </div>
          <div className="space-y-2">
            <label className="block text-sm">Password</label>
            <input className="w-full p-2 bg-gray-700 rounded-md" type="password" />
          </div>
          <ItemPresets.TEXT_SWITCH
            label="Remember me"
            value={switches.switch1}
            onChange={() => setSwitches(prev => ({ ...prev, switch1: !prev.switch1 }))}
          />
        </div>
      )
    }]
  }];

  const defaultModalSections = [
    {
      label: 'General',
      items: [
        { content: <ItemPresets.ICON_TEXT icon={Globe} label="Language Settings" /> },
        { content: <ItemPresets.TEXT_DROPDOWN 
          label="Theme"
          value="dark"
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' }
          ]}
          onChange={() => {}}
        /> }
      ]
    },
    {
      label: 'Notifications',
      items: [
        { content: <ItemPresets.TEXT_SWITCH
          label="Push Notifications"
          value={switches.switch2}
          onChange={() => setSwitches(prev => ({ ...prev, switch2: !prev.switch2 }))}
        /> }
      ]
    }
  ];

  const largeModalSections = [
    {
      label: 'Editor',
      items: [
        { content: <ItemPresets.ICON_TEXT icon={Keyboard} label="Keyboard Shortcuts" /> }
      ]
    },
    {
      label: 'System',
      items: [
        { content: <ItemPresets.TEXT_SWITCH
          label="Hardware Acceleration"
          value={switches.switch3}
          onChange={() => setSwitches(prev => ({ ...prev, switch3: !prev.switch3 }))}
        /> }
      ]
    },
    {
      label: 'Storage',
      items: [
        { content: <ItemPresets.ICON_TEXT icon={Database} label="Local Storage: 2.1 GB" /> },
        { content: <ItemPresets.ICON_TEXT icon={Cloud} label="Cloud Sync: Enabled" /> }
      ]
    }
  ];

  const modalProps = {
    small: {
      title: "",
      sections: smallModalSections,
      size: "small"
    },
    default: {
      title: "Default Modal Example",
      sections: defaultModalSections,
      size: "default"
    },
    large: {
      title: "Large Modal Example",
      sections: largeModalSections,
      size: "large"
    }
  }[currentModal];

  return modalProps ? (
    <Modal
      isOpen={true}
      onClose={onClose}
      {...modalProps}
    />
  ) : null;
}

export default DebugModal;