import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShortcutSettings } from '../../hooks/useShortcutSettings.js';

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

/**
 * The Keyboard Shortcuts dialog: the list of shortcuts and the switch that
 * turns the single-key ones off (WCAG 2.1.4). Modal: focus moves in when it
 * opens, stays inside (a click on its text focuses the panel), Tab cycles its
 * controls, and focus goes back where it was when it closes.
 */
export function KeyboardHints({ open, onClose }: KeyboardHintsProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const hintId = useId();
  const enabled = useShortcutSettings((s) => s.enabled);
  const setEnabled = useShortcutSettings((s) => s.setEnabled);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (overlayRef.current === e.target) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    switchRef.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, [open]);

  if (!open) return null;

  function keepTabInside(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const controls = [...panelRef.current!.querySelectorAll<HTMLElement>('button')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    // On the panel itself (after a click on its text), Tab goes to the first
    // control and Shift+Tab to the last, as from either end.
    const onPanel = document.activeElement === panelRef.current;
    if (e.shiftKey && (onPanel || document.activeElement === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (onPanel || document.activeElement === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.title')}
    >
      {/* tabIndex -1: a click on the dialog's text focuses the panel instead of
          dropping focus to the page behind, where Tab would leave the dialog. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={keepTabInside}
        className="bg-surface-1 border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 outline-none"
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          {t('shortcuts.title')}
        </h2>
        <div className="flex items-center justify-between gap-3">
          <span id={labelId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('shortcuts.singleKey')}
          </span>
          <button
            ref={switchRef}
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby={labelId}
            aria-describedby={hintId}
            onClick={() => setEnabled(!enabled)}
            className="shrink-0 flex items-center gap-2 min-h-6 px-1 -mx-1 rounded text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            <span aria-hidden="true">{enabled ? t('shortcuts.on') : t('shortcuts.off')}</span>
            {/* The track and its knob, at 3:1 or more on the dialog in both themes;
                justify-end puts the knob at the inline end when on. */}
            <span
              aria-hidden="true"
              className={`flex w-9 h-5 p-0.5 rounded-full transition-colors ${enabled ? 'justify-end bg-[var(--accent)]' : 'justify-start bg-gray-500'}`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow" />
            </span>
          </button>
        </div>
        <p id={hintId} className="mt-1 mb-4 text-xs text-muted">
          {t('shortcuts.singleKeyHint')}
        </p>
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
