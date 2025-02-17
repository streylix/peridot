export class MobileTouchUtils {
    static addSwipeDetection(element, callbacks = {}) {
      let touchStartX = 0;
      let touchEndX = 0;
      const minSwipeDistance = 50; // Minimum swipe distance to trigger action
  
      const handleTouchStart = (e) => {
        touchStartX = e.changedTouches[0].screenX;
      };
  
      const handleTouchEnd = (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      };
  
      const handleSwipe = () => {
        const swipeDistance = touchEndX - touchStartX;
  
        // Right swipe
        if (swipeDistance > minSwipeDistance && callbacks.onSwipeRight) {
          callbacks.onSwipeRight();
        }
        
        // Left swipe
        if (swipeDistance < -minSwipeDistance && callbacks.onSwipeLeft) {
          callbacks.onSwipeLeft();
        }
      };
  
      element.addEventListener('touchstart', handleTouchStart, { passive: true });
      element.addEventListener('touchend', handleTouchEnd, { passive: true });
  
      // Return a cleanup function
      return () => {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchend', handleTouchEnd);
      };
    }
  
    static preventPinchZoom() {
      document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }, { passive: false });
    }
  
    static enableMobileOptimizations() {
      // Disable double tap zoom
      document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }, { passive: false });
  
      // Prevent zooming on input focus
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        input.addEventListener('focus', () => {
          document.querySelector('meta[name="viewport"]').setAttribute(
            'content', 
            'width=device-width, initial-scale=1, maximum-scale=1'
          );
        });
        input.addEventListener('blur', () => {
          document.querySelector('meta[name="viewport"]').setAttribute(
            'content', 
            'width=device-width, initial-scale=1'
          );
        });
      });
    }
  }