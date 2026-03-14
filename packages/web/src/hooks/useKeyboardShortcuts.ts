import { useEffect, useState, useCallback } from 'react';
import { useTheme } from './useTheme.js';
import { useCommandCenter, type DataLayer } from './useCommandCenter.js';

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

export function useKeyboardShortcuts() {
  const { toggle: toggleTheme } = useTheme();
  const toggleLayer = useCommandCenter((s) => s.toggleLayer);
  const setActiveLayers = useCommandCenter((s) => s.setActiveLayers);
  const [hintsOpen, setHintsOpen] = useState(false);

  const openHints = useCallback(() => setHintsOpen(true), []);
  const closeHints = useCallback(() => setHintsOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;

      // Don't intercept shortcuts with modifier keys (except Shift for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      if (key === '?') {
        e.preventDefault();
        setHintsOpen((v) => !v);
        return;
      }

      if (key === 'Escape' && hintsOpen) {
        e.preventDefault();
        setHintsOpen(false);
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
  }, [hintsOpen, toggleTheme, toggleLayer, setActiveLayers]);

  return { hintsOpen, openHints, closeHints };
}
