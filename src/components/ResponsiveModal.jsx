import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import MobileModal from './MobileModal';

const ResponsiveModal = (props) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile) {
    console.log("trying to open mobile")
    return <MobileModal {...props} />;
  }

  return <Modal {...props} />;
};

export default ResponsiveModal;