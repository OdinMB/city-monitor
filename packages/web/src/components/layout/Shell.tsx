import { type ReactNode, useState, useEffect } from 'react';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { TopBar } from './TopBar.js';
import { NewsMarquee } from './NewsMarquee.js';
import { KeyboardHints } from './KeyboardHints.js';
import { Footer } from './Footer.js';

export function Shell({ children }: { children: ReactNode }) {
  const city = useCityConfig();
  const [topBarVisible, setTopBarVisible] = useState(false);
  const { hintsOpen, closeHints } = useKeyboardShortcuts();

  // Show TopBar after user scrolls past the hero map (100vh)
  useEffect(() => {
    const handleScroll = () => {
      setTopBarVisible(window.scrollY > window.innerHeight * 0.5);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-0)] text-gray-900 dark:text-gray-100">
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-transform motion-reduce:transition-none duration-300 ease-out ${topBarVisible ? 'translate-y-0' : '-translate-y-full'}`}
      >
        <TopBar />
        <NewsMarquee />
      </div>
      <main className="flex-1">
        <h1 className="sr-only">City Monitor — {city.name}</h1>
        {children}
      </main>
      <Footer />
      <KeyboardHints open={hintsOpen} onClose={closeHints} />
    </div>
  );
}
