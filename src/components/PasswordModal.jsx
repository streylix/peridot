import React, { useState, useEffect } from 'react';
import { Modal, ItemPresets, ItemComponents } from './Modal';
import { passwordModalUtils } from '../utils/PasswordModalUtils';

function PasswordModal() {
  const [modalState, setModalState] = useState({ modalType: null, noteId: null });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = passwordModalUtils.subscribe(setModalState);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!modalState.modalType) {
      resetState();
    }
  }, [modalState.modalType]);

  const resetState = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError('');
  };

  const handleSubmit = () => {
    const result = passwordModalUtils.handlePasswordSubmit(
      password,
      modalState.modalType === 'lock' ? confirmPassword : null
    );

    if (!result.success) {
      setError(result.error);
      return;
    }
    
    passwordModalUtils.closeModal();
  };

  const getModalProps = () => {
    switch (modalState.modalType) {
      case 'lock':
        return {
          title: 'Lock Note',
          content: (
            <ItemComponents.SUBSECTION title="Lock Note">
              <ItemPresets.PASSWORD_VERIFY
                password={password}
                confirmPassword={confirmPassword}
                onPasswordChange={(e) => setPassword(e.target.value)}
                onConfirmChange={(e) => setConfirmPassword(e.target.value)}
                showPasswords={showPassword}
                onToggleShow={() => setShowPassword(!showPassword)}
                error={error}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </ItemComponents.SUBSECTION>
          )
        };
      case 'unlock':
        return {
          title: 'Unlock Note',
          content: (
            <ItemComponents.SUBSECTION title="Unlock Note">
              <ItemPresets.PASSWORD
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showPassword={showPassword}
                onToggleShow={() => setShowPassword(!showPassword)}
                error={error}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </ItemComponents.SUBSECTION>
          )
        };
      case 'download':
        return {
          title: 'Download Protected Note',
          content: (
            <ItemComponents.SUBSECTION title="Download Note">
              <ItemPresets.PASSWORD
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showPassword={showPassword}
                onToggleShow={() => setShowPassword(!showPassword)}
                error={error}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </ItemComponents.SUBSECTION>
          )
        };
      case 'lockFolder':
        return {
          title: 'Lock Folder',
          content: (
            <ItemComponents.SUBSECTION title="Lock Folder">
              <ItemPresets.PASSWORD_VERIFY
                password={password}
                confirmPassword={confirmPassword}
                onPasswordChange={(e) => setPassword(e.target.value)}
                onConfirmChange={(e) => setConfirmPassword(e.target.value)}
                showPasswords={showPassword}
                onToggleShow={() => setShowPassword(!showPassword)}
                error={error}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </ItemComponents.SUBSECTION>
          )
        };
      case 'unlockFolderPermanent':
      case 'unlockFolder':
        return {
          title: 'Unlock Folder',
          content: (
            <ItemComponents.SUBSECTION title="Unlock Folder">
              <ItemPresets.PASSWORD
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showPassword={showPassword}
                onToggleShow={() => setShowPassword(!showPassword)}
                error={error}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </ItemComponents.SUBSECTION>
          )
        };
      case 'download-folder':
        return {
          title: 'Download Protected Folder',
          content: (
            <ItemComponents.SUBSECTION title="Download Folder">
              <ItemPresets.PASSWORD
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showPassword={showPassword}
                onToggleShow={() => setShowPassword(!showPassword)}
                error={error}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </ItemComponents.SUBSECTION>
          )
        };
      default:
        return null;
    }
  };

  const modalProps = getModalProps();
  if (!modalProps) return null;

  const sections = [{
    items: [{
      content: (
        <>
          {modalProps.content}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button 
              className="modal-button" 
              onClick={() => passwordModalUtils.closeModal()} 
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button 
              className="primary" 
              onClick={handleSubmit} 
              style={{ flex: 1 }}
            >
              {modalState.modalType === 'download' ? 'Download' : 'OK'}
            </button>
          </div>
        </>
      )
    }]
  }];

  return (
    <Modal
      isOpen={!!modalState.modalType}
      onClose={() => passwordModalUtils.closeModal()}
      title={modalProps.title}
      sections={sections}
      size="small"
    />
  );
}

export default PasswordModal;