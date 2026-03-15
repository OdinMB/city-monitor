import { useState, useRef, useCallback, useEffect } from 'react';
import { DataLayerToggles } from './DataLayerToggles.js';

const PANEL_W = 200;
const CLOSED_X = -PANEL_W;
const OPEN_X = 0;
const MID = (CLOSED_X + OPEN_X) / 2;

/** Mobile-only slide-from-left drawer for data layer controls. */
export function MobileLayerDrawer() {
  const [open, setOpen] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(() => {
    try { return localStorage.getItem('cm-drawer-seen') === '1'; } catch { return false; }
  });
  const [dragX, setDragX] = useState<number | null>(null);
  const touchRef = useRef({ startX: 0, startY: 0, baseX: CLOSED_X, locked: '' as '' | 'x' | 'y' });

  const baseX = open ? OPEN_X : CLOSED_X;
  const x = dragX ?? baseX;
  const progress = (x - CLOSED_X) / (OPEN_X - CLOSED_X);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      touchRef.current = { startX: t.clientX, startY: t.clientY, baseX: open ? OPEN_X : CLOSED_X, locked: '' };
    },
    [open],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const ref = touchRef.current;
    const t = e.touches[0];
    const dx = t.clientX - ref.startX;
    const dy = t.clientY - ref.startY;

    if (!ref.locked) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        ref.locked = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }
      return;
    }
    if (ref.locked !== 'x') return;

    setDragX(Math.max(CLOSED_X, Math.min(OPEN_X, ref.baseX + dx)));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragX === null) return;
    setOpen(dragX > MID);
    setDragX(null);
  }, [dragX]);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  return (
    <div className="absolute inset-0 z-40 lg:hidden pointer-events-none">
      {/* Backdrop */}
      {progress > 0 && (
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{ backgroundColor: `rgba(0,0,0,${0.25 * progress})` }}
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sliding container: panel + tab handle */}
      <div
        className={`absolute inset-y-0 left-0 pointer-events-auto flex ${
          dragX === null ? 'transition-transform duration-200 ease-out' : ''
        }`}
        style={{ transform: `translateX(${x}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Panel content */}
        <div
          role="dialog"
          aria-label="Data layers"
          className="h-full shrink-0 bg-surface-1 border-r border-border p-3 pt-12 overflow-y-auto space-y-4"
          style={{ width: PANEL_W }}
        >
          <DataLayerToggles />
        </div>

        {/* Tab handle */}
        <button
          className={`self-center shrink-0 flex items-center justify-center w-9 h-20 bg-surface-1/90 backdrop-blur-sm border border-l-0 border-border rounded-r-xl shadow-lg cursor-pointer ${!hasBeenOpened ? 'animate-drawer-breathe' : ''}`}
          onClick={() => {
            setOpen((v) => !v);
            if (!hasBeenOpened) {
              setHasBeenOpened(true);
              try { localStorage.setItem('cm-drawer-seen', '1'); } catch { /* noop */ }
            }
          }}
          aria-label="Toggle layers panel"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-300">
            <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
            <path d="m22 12.65-8.58 3.91a2 2 0 0 1-1.66 0L3.18 12.9" />
            <path d="m22 17.65-8.58 3.91a2 2 0 0 1-1.66 0L3.18 17.9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
