import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Modal, ItemPresets } from './Modal';

function LockNoteModal({ isOpen, onClose, onConfirm }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setError('');
      setShowPassword(false);
      }
    }, [isOpen]);

  const handleSubmit = () => {
    if (!password || !confirmPassword) {
      setError('Please fill in both password fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setPassword('');
    setConfirmPassword('');
    setError('');
    onClose();
    onConfirm(password)
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const sections = [{
    items: [{
      content: (
        <div className="outer-small">
          <div className="inner-small">
            <label>Password</label>
            <input 
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter password"
              autoFocus
            />
          </div>
          <div className="inner-small">
            <label>Confirm Password</label>
            <input 
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Confirm password"
            />
          </div>
          {error && <div style={{ color: '#ff4444', fontSize: '14px', marginTop: '8px' }}>{error}</div>}
          <ItemPresets.TEXT_SWITCH
            label="Show passwords"
            value={showPassword}
            onChange={() => setShowPassword(!showPassword)}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button className="primary" onClick={handleSubmit} style={{ flex: 1 }}>OK</button>
          </div>
        </div>
      )
    }]
  }];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lock Note"
      sections={sections}
      size="small"
    />
  );
}

export default LockNoteModal;