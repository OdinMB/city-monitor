import { type RefObject, useEffect, useState } from 'react';

interface ScrollIndicatorProps {
  targetRef: RefObject<HTMLDivElement | null>;
}

/** Scroll-down indicator: mouse icon on desktop, chevron on mobile. Fades out on scroll. */
export function ScrollIndicator({ targetRef }: ScrollIndicatorProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY < 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = () => {
    targetRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative z-20 mx-auto lg:mr-[45%] mb-1 lg:mb-6 flex flex-col items-center gap-2 cursor-pointer pointer-events-auto transition-opacity duration-500 ${visible ? 'opacity-90 hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-label="Scroll to dashboard"
    >
      {/* Dark chip behind the chevron: a white glyph alone is unreadable over the
          pale light-mode basemap. The ring keeps it delineated on dark tiles too. */}
      <span className="w-11 h-11 rounded-full bg-black/45 ring-1 ring-white/25 shadow-lg backdrop-blur-[2px] flex items-center justify-center animate-scroll-bounce">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          className="text-white w-11 h-11"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
