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
      className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full z-20 pb-4 flex flex-col items-center gap-2 cursor-pointer transition-opacity duration-500 ${visible ? 'opacity-70 hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-label="Scroll to dashboard"
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        className="text-gray-800 dark:text-white drop-shadow-lg animate-scroll-dot"
      >
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
