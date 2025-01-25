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
        <div className="outer-small">
          <div className="inner-small">
            <label>Username</label>
            <input type="text" />
          </div>
          <div className="inner-small">
            <label>Password</label>
            <input type="password" />
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
        { content: <ItemPresets.SUBSECTION title="Region Settings">
            <ItemPresets.ICON_TEXT icon={Globe} label="Language Settings" />
            <ItemPresets.TEXT_DROPDOWN
              label="Theme"
              value="dark"
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' }
              ]}
              onChange={() => {}}
            />
            <ItemPresets.TEXT_DROPDOWN
              label="Date Format"
              value="iso"
              options={[
                { value: 'iso', label: 'YYYY-MM-DD' },
                { value: 'us', label: 'MM/DD/YYYY' },
                { value: 'eu', label: 'DD/MM/YYYY' }
              ]}
              onChange={() => {}}
            />
          </ItemPresets.SUBSECTION>
        },
        { content: <ItemPresets.SUBSECTION title="Privacy">
            <ItemPresets.TEXT_SWITCH
              label="Share analytics"
              value={switches.analytics}
              onChange={() => setSwitches(prev => ({ ...prev, analytics: !prev.analytics }))}
            />
            <ItemPresets.TEXT_SWITCH
              label="Auto-backup"
              value={switches.backup}
              onChange={() => setSwitches(prev => ({ ...prev, backup: !prev.backup }))}
            />
          </ItemPresets.SUBSECTION>
        }
      ]
    },
    {
      label: 'Notifications',
      items: [
        { content: <ItemPresets.TEXT_SWITCH
            label="Push Notifications"
            value={switches.push}
            onChange={() => setSwitches(prev => ({ ...prev, push: !prev.push }))}
          />
        },
        { content: <ItemPresets.TEXT_SWITCH
            label="Email Notifications"
            value={switches.email}
            onChange={() => setSwitches(prev => ({ ...prev, email: !prev.email }))}
          />
        },
        { content: <ItemPresets.TEXT_SWITCH
            label="Sound Effects"
            value={switches.sound}
            onChange={() => setSwitches(prev => ({ ...prev, sound: !prev.sound }))}
          />
        }
      ]
    }
  ];


  const largeModalSections = [
    {
      label: 'Editor',
      items: [
        { content: <ItemPresets.SUBSECTION title="Shortcuts">
            <ItemPresets.ICON_TEXT icon={Keyboard} label="Keyboard Shortcuts" />
            <ItemPresets.TEXT_SWITCH
              label="Vim Mode"
              value={switches.vim}
              onChange={() => setSwitches(prev => ({ ...prev, vim: !prev.vim }))}
            />
            <ItemPresets.TEXT_SWITCH
              label="Auto-complete"
              value={switches.autocomplete}
              onChange={() => setSwitches(prev => ({ ...prev, autocomplete: !prev.autocomplete }))}
            />
          </ItemPresets.SUBSECTION>
        }
      ]
    },
    {
      label: 'System',
      items: [
        { content: <ItemPresets.SUBSECTION title="Performance">
            <ItemPresets.TEXT_SWITCH
              label="Hardware Acceleration"
              value={switches.hardware}
              onChange={() => setSwitches(prev => ({ ...prev, hardware: !prev.hardware }))}
            />
            <ItemPresets.TEXT_SWITCH
              label="Background Processing"
              value={switches.background}
              onChange={() => setSwitches(prev => ({ ...prev, background: !prev.background }))}
            />
            <ItemPresets.TEXT_DROPDOWN
              label="Process Priority"
              value="normal"
              options={[
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' }
              ]}
              onChange={() => {}}
            />
          </ItemPresets.SUBSECTION>
        }
      ]
    },
    {
      label: 'Storage',
      items: [
        { content: <ItemPresets.SUBSECTION title="Storage Management">
            <ItemPresets.ICON_TEXT icon={Database} label="Local Storage: 2.1 GB" />
            <ItemPresets.ICON_TEXT icon={Cloud} label="Cloud Sync: Enabled" />
            <ItemPresets.TEXT_BUTTON
              label="Clear Cache"
              buttonText="Clear"
              onClick={() => {}}
            />
          </ItemPresets.SUBSECTION>
        }
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