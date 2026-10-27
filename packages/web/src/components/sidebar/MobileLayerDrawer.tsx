import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { DataLayerToggles } from './DataLayerToggles.js';

const PANEL_W = 200;
// Offsets along the inline axis: negative pushes the drawer out past its start
// edge. `dir` turns one into a screen offset (translateX), and a finger's
// screen movement back into one.
const CLOSED_X = -PANEL_W;
const OPEN_X = 0;
const MID = (CLOSED_X + OPEN_X) / 2;

/**
 * Mobile-only drawer for data layer controls. It slides in from the inline
 * start: the left edge, or the right edge in a right-to-left language.
 * Closed, the panel is off screen and inert, so it is out of the Tab order
 * and the accessibility tree. Opening moves focus into it; closing it with
 * focus inside hands focus back to the layers button.
 */
export function MobileLayerDrawer() {
  const { t, i18n } = useTranslation();
  const dir = i18n.dir(i18n.language) === 'rtl' ? -1 : 1;
  const [open, setOpen] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(() => {
    try { return localStorage.getItem('cm-drawer-seen') === '1'; } catch { return false; }
  });
  const [dragX, setDragX] = useState<number | null>(null);
  const touchRef = useRef({ startX: 0, startY: 0, baseX: CLOSED_X, locked: '' as '' | 'x' | 'y' });
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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

    setDragX(Math.max(CLOSED_X, Math.min(OPEN_X, ref.baseX + dx * dir)));
  }, [dir]);

  // The closed panel is inert, and an inert panel drops the focus it holds.
  // Hand that focus to the layers button before it goes.
  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) handleRef.current?.focus();
    setOpen(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragX === null) return;
    if (dragX > MID) setOpen(true);
    else close();
    setDragX(null);
  }, [dragX, close]);

  // On opening, focus moves to the first control in the panel: it comes
  // before the layers button in the page, so Tab from the button would skip
  // it. Some controls are hidden on phones, where focus() does nothing, so
  // try each in turn.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      for (const control of panelRef.current?.querySelectorAll<HTMLElement>('button') ?? []) {
        control.focus();
        if (document.activeElement === control) break;
      }
    }
    wasOpen.current = open;
  }, [open]);

  // Close on Escape key, unless a modal dialog on top (the shortcuts dialog,
  // opened from the panel) has focus: that Escape is the dialog's.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (document.activeElement?.closest('[aria-modal="true"]')) return;
      close();
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
        className={`absolute inset-y-0 inset-s-0 pointer-events-auto flex ${
          dragX === null ? 'transition-transform duration-200 ease-out' : ''
        }`}
        style={{ transform: `translateX(${x * dir}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Panel content. Inert while closed: off screen, so not focusable or announced. */}
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t('sidebar.layers.label')}
          inert={!open}
          className="h-full shrink-0 bg-surface-1 border-e border-border p-3 pt-12 max-sm:pt-3 overflow-y-auto space-y-4"
          style={{ width: PANEL_W }}
        >
          <DataLayerToggles />
        </div>

        {/* Tab handle */}
        <button
          ref={handleRef}
          type="button"
          className={`self-center shrink-0 flex items-center justify-center w-9 h-20 bg-surface-1/90 backdrop-blur-sm border border-s-0 border-border rounded-e-xl shadow-lg cursor-pointer ${!hasBeenOpened ? 'animate-drawer-breathe' : ''}`}
          onClick={() => {
            setOpen((v) => !v);
            if (!hasBeenOpened) {
              setHasBeenOpened(true);
              try { localStorage.setItem('cm-drawer-seen', '1'); } catch { /* noop */ }
            }
          }}
          aria-label={t('sidebar.toggleLayers')}
          aria-expanded={open}
          aria-controls={panelId}
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
