import { type ReactNode, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { TopBar } from './TopBar.js';
import { NewsMarquee } from './NewsMarquee.js';
import { KeyboardHints } from './KeyboardHints.js';
import { ShortcutToast } from './ShortcutToast.js';
import { Footer } from './Footer.js';

export function Shell({ children }: { children: ReactNode }) {
  const city = useCityConfig();
  const { hintsOpen, closeHints } = useKeyboardShortcuts();
  // Phones (below sm) don't slide the bar: the bar and the ticker stick to the
  // top of the page from the first screen, and the map below them fills the
  // rest of it (CommandLayout reads the block's height from --phone-header-h).
  const isPhone = !useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
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

  // Phones: publish the block's height (bar + ticker) as --phone-header-h on the
  // root. Measured in a layout effect so the map is sized before the first
  // paint, then kept current by the observer. Written to the DOM directly, so a
  // size change doesn't re-render the page.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const block = blockRef.current;
    if (!isPhone || !root || !block) return;
    const publish = (h: number) => root.style.setProperty('--phone-header-h', `${h}px`);
    publish(block.getBoundingClientRect().height);
    const ro = new ResizeObserver(([entry]) => publish(entry.contentRect.height));
    ro.observe(block);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--phone-header-h');
    };
  }, [isPhone]);

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
    <div
      ref={rootRef}
      className="min-h-screen flex flex-col bg-surface-0 dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(var(--accent-rgb),0.04),var(--surface-0))] text-gray-900 dark:text-gray-100"
    >
      {/* topbar-slide: globals.css pins the bar on screen while it holds keyboard focus */}
      <div
        ref={blockRef}
        className={`topbar-slide ${isPhone ? 'sticky top-0' : 'fixed top-0 left-0 right-0'} z-50`}
        style={isPhone ? undefined : { transform: `translateY(${translateY}px)` }}
      >
        <div ref={topBarRef} className="topbar-slide-bar">
          <TopBar />
        </div>
        <NewsMarquee reserveSpace={isPhone} />
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
