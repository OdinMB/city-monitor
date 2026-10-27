import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNina } from '../../hooks/useNina.js';
import type { NinaWarning } from '../../lib/api.js';

// Every pair meets WCAG AA (4.5:1) for the banner's small text. The text is
// drawn at full opacity because white at 80-90% drops below 4.5:1 on red.
const SEVERITY_STYLES: Record<string, string> = {
  extreme: 'bg-red-700 text-white dark:bg-red-800',
  severe: 'bg-red-600 text-white dark:bg-red-700',
  moderate: 'bg-amber-500 text-amber-950 dark:bg-amber-600',
  minor: 'bg-yellow-400 text-yellow-900 dark:bg-yellow-500 dark:text-yellow-900',
};

const SEVERITY_ICONS: Record<string, string> = {
  extreme: '🚨',
  severe: '⚠️',
  moderate: '⚠️',
  minor: 'ℹ️',
};

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('nina-dismissed');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function setDismissedIds(ids: Set<string>) {
  try {
    localStorage.setItem('nina-dismissed', JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the dismissal still holds for this page view.
  }
}

export function NinaBanner() {
  const { id: cityId, country } = useCityConfig();
  const { data: warnings } = useNina(cityId);
  const [dismissed, setDismissed] = useState(getDismissedIds);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      setDismissedIds(next);
      return next;
    });
  }, []);

  // Only show for German cities
  if (country !== 'DE') return null;

  const active = (warnings ?? []).filter((w) => !dismissed.has(w.id));
  if (active.length === 0) return null;

  return (
    <div className="space-y-2 mb-4" aria-live="polite">
      {active.map((warning) => (
        <NinaWarningCard key={warning.id} warning={warning} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function NinaWarningCard({ warning, onDismiss }: { warning: NinaWarning; onDismiss: (id: string) => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[warning.severity] ?? SEVERITY_STYLES.minor;
  const icon = SEVERITY_ICONS[warning.severity] ?? '';

  return (
    <div className={`nina-warning rounded-lg px-4 py-3 ${style}`} role="alert">
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">{icon}</span>
        {/* The warning's own text is German: each part sits in a <bdi>, so an
            Arabic page keeps its word order. */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight"><bdi>{warning.headline}</bdi></div>
          <div className="text-xs mt-0.5">
            {warning.source.toUpperCase()} · {t(`nina.severity.${warning.severity}`, warning.severity)}
          </div>
        </div>
        {/* min-w-6 min-h-6: each button is at least a 24px tap target (WCAG 2.5.8). */}
        <div className="flex items-center gap-1 shrink-0">
          {(warning.description || warning.instruction) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center justify-center min-w-6 min-h-6 p-1 rounded hover:bg-white/20 text-xs"
              aria-expanded={expanded}
              aria-label={expanded ? t('tile.collapse') : t('tile.expand')}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
          <button
            onClick={() => onDismiss(warning.id)}
            className="inline-flex items-center justify-center min-w-6 min-h-6 p-1 rounded hover:bg-white/20 text-xs"
            aria-label={t('nina.dismiss', 'Dismiss')}
          >
            ✕
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 text-sm space-y-2">
          {warning.description && <p><bdi>{warning.description}</bdi></p>}
          {warning.instruction && (
            <p className="font-medium"><bdi>{warning.instruction}</bdi></p>
          )}
        </div>
      )}
    </div>
  );
}
