import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'hasSeenKeyboardHints';

// With site storage blocked every access throws: the hint then counts as not
// seen and shows once per page view.
function hasSeenHint(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function markHintSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage blocked: nothing to remember the hint in.
  }
}

/** One-time toast in bottom-right: "Press ? for keyboard shortcuts". */
export function ShortcutToast() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasSeenHint()) return;

    // Show after a brief delay so it doesn't appear during initial load
    const showTimer = setTimeout(() => setVisible(true), 1500);

    // Auto-dismiss after 5 seconds
    const hideTimer = setTimeout(() => {
      setVisible(false);
      markHintSeen();
    }, 6500);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    markHintSeen();
  };

  if (!visible) return null;

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
