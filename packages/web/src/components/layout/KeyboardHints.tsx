import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface KeyboardHintsProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: '?', action: 'shortcuts.toggleHints' },
  { key: 'D', action: 'shortcuts.toggleDark' },
  { key: '1-9', action: 'shortcuts.toggleLayer' },
  { key: '0', action: 'shortcuts.clearLayers' },
  { key: 'Esc', action: 'shortcuts.close' },
] as const;

export function KeyboardHints({ open, onClose }: KeyboardHintsProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (overlayRef.current === e.target) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.title')}
    >
      <div className="bg-surface-1 border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          {t('shortcuts.title')}
        </h2>
        <dl className="space-y-2">
          {SHORTCUTS.map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between">
              <dt className="text-sm text-gray-600 dark:text-gray-400">{t(action)}</dt>
              <dd>
                <kbd className="px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">
                  {key}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full px-3 py-1.5 text-sm rounded border border-border hover:bg-surface-2 transition-colors cursor-pointer"
        >
          {t('shortcuts.close')}
        </button>
      </div>
    </div>
  );
}
