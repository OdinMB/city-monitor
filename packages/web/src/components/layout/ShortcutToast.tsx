import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsTouchOnly } from '../../hooks/useMediaQuery.js';

const STORAGE_KEY = 'hasSeenKeyboardHints';

/**
 * One-time toast in bottom-right: "Press ? for keyboard shortcuts".
 * Not shown on touch-only devices, which have no keyboard to use the
 * shortcuts with; the shortcuts themselves still work everywhere. The seen
 * flag is left unset there, so the toast can still appear once if a mouse
 * or trackpad is attached later.
 */
export function ShortcutToast() {
  const { t } = useTranslation();
  const touchOnly = useIsTouchOnly();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (touchOnly) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Show after a brief delay so it doesn't appear during initial load
    const showTimer = setTimeout(() => setVisible(true), 1500);

    // Auto-dismiss after 5 seconds
    const hideTimer = setTimeout(() => {
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, '1');
    }, 6500);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [touchOnly]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, '1');
  };

  if (!visible || touchOnly) return null;

  return (
    <button
      type="button"
      onClick={dismiss}
      className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg bg-surface-1 border border-border card-glow text-sm text-gray-700 dark:text-gray-300 shadow-lg animate-fade-in cursor-pointer hover:bg-surface-2 transition-colors"
      aria-live="polite"
    >
      <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono font-semibold mr-1.5">?</kbd>
      {t('shortcuts.toastHint')}
    </button>
  );
}
