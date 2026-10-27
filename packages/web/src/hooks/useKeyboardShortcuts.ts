import { useEffect, useCallback } from 'react';
import { useTheme } from './useTheme.js';
import { useCommandCenter, type DataLayer } from './useCommandCenter.js';
import { useShortcutSettings } from './useShortcutSettings.js';

/** Ordered list of data layers for number-key shortcuts (1-9). */
const LAYER_ORDER: DataLayer[] = [
  'warnings', 'news', 'traffic', 'weather', 'air-quality',
  'noise', 'water', 'emergencies', 'social',
];

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * The page-wide single-key shortcuts: ? for the shortcuts dialog, D for dark
 * mode, 1-9 for a data layer and 0 to clear them. They work anywhere on the
 * page, as they always have, until someone switches them off in that dialog
 * (WCAG 2.1.4); Escape still closes the dialog then.
 */
export function useKeyboardShortcuts() {
  const { toggle: toggleTheme } = useTheme();
  const toggleLayer = useCommandCenter((s) => s.toggleLayer);
  const setActiveLayers = useCommandCenter((s) => s.setActiveLayers);
  const enabled = useShortcutSettings((s) => s.enabled);
  const hintsOpen = useShortcutSettings((s) => s.hintsOpen);
  const setHintsOpen = useShortcutSettings((s) => s.setHintsOpen);

  const openHints = useCallback(() => setHintsOpen(true), [setHintsOpen]);
  const closeHints = useCallback(() => setHintsOpen(false), [setHintsOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;

      // Don't intercept shortcuts with modifier keys (except Shift for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      if (key === 'Escape' && hintsOpen) {
        e.preventDefault();
        setHintsOpen(false);
        return;
      }

      // Every shortcut below is a single character key.
      if (!enabled) return;

      if (key === '?') {
        e.preventDefault();
        setHintsOpen(!hintsOpen);
        return;
      }

      if (key === 'd' || key === 'D') {
        e.preventDefault();
        toggleTheme();
        return;
      }

      if (key === '0') {
        e.preventDefault();
        setActiveLayers(new Set());
        return;
      }

      const num = parseInt(key, 10);
      if (num >= 1 && num <= 9 && num <= LAYER_ORDER.length) {
        e.preventDefault();
        toggleLayer(LAYER_ORDER[num - 1]);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, hintsOpen, setHintsOpen, toggleTheme, toggleLayer, setActiveLayers]);

  return { hintsOpen, openHints, closeHints };
}
