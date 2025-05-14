'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only trigger transition if pathname has changed
    if (pathname !== prevPathname) {
      setPrevPathname(pathname);
      
      // Start transition out
      setIsTransitioning(true);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // After a short delay, start transition in with new content
      timeoutRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, 100); // Make this even shorter for an almost imperceptible transition
    }
    
    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname, children, prevPathname]); // Added missing dependencies

  return (
    <div className="relative">
      {/* New content that fades in */}
      <div
        className={`transition-all duration-150 ease-out will-change-opacity ${isTransitioning ? 'opacity-[0.98] transform translate-y-[0.5px]' : 'opacity-100 transform translate-y-0'}`}
        style={{ 
          WebkitBackfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased',
          WebkitTransformStyle: 'preserve-3d' // Further reduces flashing
        }}
      >
        {children}
      </div>
    </div>
  );
}
