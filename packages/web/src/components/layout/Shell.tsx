import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { TopBar } from './TopBar.js';
import { NewsMarquee } from './NewsMarquee.js';
import { KeyboardHints } from './KeyboardHints.js';
import { ShortcutToast } from './ShortcutToast.js';
import { Footer } from './Footer.js';

export function Shell({ children }: { children: ReactNode }) {
  const city = useCityConfig();
  const { hintsOpen, closeHints } = useKeyboardShortcuts();
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarH, setTopBarH] = useState(0);
  const [progress, setProgress] = useState(0); // 0 = hidden, 1 = fully visible

  // Measure TopBar height so we can translate by exactly that amount
  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTopBarH(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Progressively slide the top bar in/out based on scroll position.
  // Starts appearing at 40% viewport height, fully visible at 90%.
  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    const start = vh * 0.4;
    const end = vh * 0.9;

    if (scrollY <= start) {
      setProgress(0);
    } else if (scrollY >= end) {
      setProgress(1);
    } else {
      setProgress((scrollY - start) / (end - start));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Translate the whole fixed block: -topBarH (TopBar hidden, marquee at top edge) → 0 (both visible)
  const translateY = topBarH ? -topBarH * (1 - progress) : -40;

  return (
    <div className="min-h-screen flex flex-col bg-surface-0 dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(var(--accent-rgb),0.04),var(--surface-0))] text-gray-900 dark:text-gray-100">
      <div
        className="fixed top-0 left-0 right-0 z-50"
        style={{ transform: `translateY(${translateY}px)` }}
      >
        <div ref={topBarRef}>
          <TopBar />
        </div>
        <NewsMarquee />
      </div>
      <main className="flex-1">
        <h1 className="sr-only">City Monitor — {city.name}</h1>
        {children}
      </main>
      <Footer />
      <KeyboardHints open={hintsOpen} onClose={closeHints} />
      <ShortcutToast />
    </div>
  );
}
