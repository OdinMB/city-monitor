import { useEffect, useCallback } from 'react';
import { useTheme } from './useTheme.js';
import { CATEGORY_ORDER, useCommandCenter, type DataLayer } from './useCommandCenter.js';
import { useShortcutSettings } from './useShortcutSettings.js';
import { categoryDefaults } from '../lib/map-layers.js';

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
 * mode, 1-8 for a map category (CATEGORY_ORDER) and 0 to clear them. They work anywhere on the
 * page, as they always have, until someone switches them off in that dialog
 * (WCAG 2.1.4); Escape still closes the dialog then. A number keeps its layer
 * in every city, and does nothing in a city without that layer (`layers`, the
 * ones the city has).
 */
export function useKeyboardShortcuts(layers: ReadonlySet<DataLayer>) {
  const { toggle: toggleTheme } = useTheme();
  const toggleCategory = useCommandCenter((s) => s.toggleCategory);
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
      if (num >= 1 && num <= 9 && num <= CATEGORY_ORDER.length) {
        const category = CATEGORY_ORDER[num - 1];
        const defaults = categoryDefaults(category, layers);
        if (defaults.length === 0) return;
        e.preventDefault();
        toggleCategory(category, defaults);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, hintsOpen, setHintsOpen, toggleTheme, toggleCategory, setActiveLayers, layers]);

  return { hintsOpen, openHints, closeHints };
}
