import React, { useState } from 'react';
import { Modal, ItemPresets, ItemComponents } from './Modal';
import { Lock, Globe, Bell, Keyboard, Code, Database, Cloud } from 'lucide-react';

function DebugModal({ currentModal, onClose }) {
  const [theme, setTheme] = useState("dark");
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
              value={theme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' }
              ]}
              onChange={setTheme}
              onSelect={(theme) => document.body.className = theme}
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
      label: "General",
      items: [
        {
          content: <ItemPresets.SUBSECTION title="App">
            <ItemPresets.TEXT_BUTTON
              label="Current version: v1.7.7"
              subtext="(Installer version: v1.7.7)&#10;Obsidian is up to date!&#10;Read the changelog."
              buttonText="Check for updates"
              primary
            />
          </ItemPresets.SUBSECTION>
        },
        {
          content: <ItemPresets.TEXT_SWITCH
            label="Automatic updates"
            subtext="Turn this off to prevent the app from checking for updates."
            value={switches.updates}
            onChange={() => setSwitches(prev => ({ ...prev, updates: !prev.updates }))}
          />
        },
        {
          content: <ItemPresets.SUBSECTION title="Language">
            <ItemPresets.TEXT_DROPDOWN
              label="Change the display language."
              subtext="Learn how to add a new language to Obsidian."
              value="english"
              options={[{ value: "english", label: "English" }]}
            />
          </ItemPresets.SUBSECTION>
        },
        {
          content: <ItemPresets.SUBSECTION title="Help">
            <ItemPresets.TEXT_BUTTON
              label="Learn how to use Obsidian and get help from the community."
              buttonText="Open"
            />
          </ItemPresets.SUBSECTION>
        }
      ]
    },
    {
      label: "Account",
      items: [
        {
          content: <ItemPresets.SUBSECTION title="Your account">
            <ItemComponents.CONTAINER>
              <ItemComponents.TEXT
                label="You're not logged in right now."
                subtext="An account is only needed for Obsidian Sync, Obsidian Publish, and early access versions."
              />
                <ItemComponents.BUTTON>Log in</ItemComponents.BUTTON>
                <ItemComponents.BUTTON>Sign up</ItemComponents.BUTTON>
            </ItemComponents.CONTAINER>
          </ItemPresets.SUBSECTION>
        },
        {
          content: <ItemPresets.SUBSECTION title="Commercial license">
            <ItemComponents.CONTAINER>
              <ItemComponents.TEXT
                label="A commercial license is required if you use Obsidian for work within a for-profit company of two or more people."
                subtext="Learn more"
              />
                <ItemComponents.BUTTON primary='True'>Activate</ItemComponents.BUTTON>
                <ItemComponents.BUTTON>Purchase</ItemComponents.BUTTON>
            </ItemComponents.CONTAINER>
          </ItemPresets.SUBSECTION>
        }
      ]
    },
    {
      label: "Advanced",
      items: [
        {
          content: <ItemPresets.TEXT_SWITCH
            label="Notify if startup takes longer than expected"
            subtext="Diagnose issues with your app by seeing what is causing the app to load slowly."
            value={switches.startup}
            onChange={() => setSwitches(prev => ({ ...prev, startup: !prev.startup }))}
          />
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