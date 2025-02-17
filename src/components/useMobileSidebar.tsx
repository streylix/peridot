import { useState, useEffect, useCallback } from 'react';

interface UseMobileSidebarProps {
  sidebarRef: React.RefObject<HTMLDivElement>;
  onToggleSidebar: () => void;
}

export const useMobileSidebar = ({ sidebarRef, onToggleSidebar }: UseMobileSidebarProps) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  // Check for mobile on resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 600);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Touch start handler
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isMobile) return;
    setTouchStart(e.targetTouches[0].clientX);
  }, [isMobile]);

  // Touch move handler for sidebar swipe
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isMobile) return;
    setTouchEnd(e.targetTouches[0].clientX);
  }, [isMobile]);

  // Touch end handler to detect swipe
  const handleTouchEnd = useCallback(() => {
    if (!isMobile) return;
    const touchDiff = touchStart - touchEnd;
    const sidebarElement = sidebarRef.current;
    console.log(touchDiff, touchStart, touchEnd);
    // Detect right swipe to open sidebar
    if (touchDiff < -200 && sidebarElement?.classList.contains('hidden')) {
      onToggleSidebar();
    }

    // Detect left swipe to close sidebar
    else if (touchDiff < touchStart && touchDiff > 200 && !sidebarElement?.classList.contains('hidden')) {
      console.log("closing")
      onToggleSidebar();
    }

    // Reset touch positions
    setTouchStart(0);
    setTouchEnd(0);
  }, [isMobile, touchStart, touchEnd, onToggleSidebar]);

  // Note selection handler to close sidebar on mobile ONLY when a note is selected
  const handleNoteSelect = useCallback((noteId: number | string) => {
    if (isMobile) {
      const sidebarElement = sidebarRef.current;
      const mainContent = document.querySelector('.main-content');
      
      if (sidebarElement && !sidebarElement.classList.contains('hidden') && mainContent) {
        sidebarElement.classList.add('hidden');
        mainContent.classList.add('full-width');
      }
    }
    return noteId; // Always return the noteId to allow chaining
  }, [isMobile, sidebarRef]);

  // Add touch event listeners
  useEffect(() => {
    if (!isMobile) return;
    
    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isMobile,
    handleNoteSelect
  };
};