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

/**
 * Active NINA warnings. `compact` renders each as a one-line pill (severity
 * word and headline, source for screen readers) that always expands to the
 * full card; CommandLayout uses it over the map on phones.
 */
export function NinaBanner({ compact = false }: { compact?: boolean }) {
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
    <div className={compact ? 'flex flex-col items-center gap-1' : 'space-y-2 mb-4'} aria-live="polite">
      {active.map((warning) => (
        <NinaWarningCard key={warning.id} warning={warning} onDismiss={dismiss} compact={compact} />
      ))}
    </div>
  );
}

function NinaWarningCard({
  warning,
  onDismiss,
  compact,
}: {
  warning: NinaWarning;
  onDismiss: (id: string) => void;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[warning.severity] ?? SEVERITY_STYLES.minor;
  const icon = SEVERITY_ICONS[warning.severity] ?? '';
  const source = warning.source.toUpperCase();
  const severity = t(`nina.severity.${warning.severity}`, warning.severity);
  const hasDetails = Boolean(warning.description || warning.instruction);
  // Compact cards sit over the map: a one-line pill (severity word, then the
  // headline cut to fit) until expanded, then a card as wide as the overlay
  // with the full headline. A pill can always expand, because its headline may
  // be cut off even when the warning has no details. Both take pointer events
  // back from the overlay, and their buttons get a 24px minimum target.
  const pill = compact && !expanded;
  const shape = !compact
    ? 'rounded-lg px-4 py-3'
    : pill
      ? 'max-w-full rounded-full px-3 py-1 shadow-lg pointer-events-auto'
      : 'self-stretch rounded-lg px-3 py-2 shadow-lg pointer-events-auto';
  const buttonClass = `p-1 rounded hover:bg-white/20 text-xs${compact ? ' inline-flex items-center justify-center min-w-6 min-h-6' : ''}`;

  return (
    <div className={`nina-warning ${shape} ${style}`} role="alert">
      <div className={`flex ${pill ? 'items-center' : 'items-start'} gap-2`}>
        <span className={`${compact ? 'text-sm' : 'text-lg'} shrink-0`}>{icon}</span>
        <div className="flex-1 min-w-0">
          {pill ? (
            <div className="text-xs leading-tight truncate">
              <span className="font-bold">{severity}</span>
              {' · '}
              <span className="font-semibold">{warning.headline}</span>
              <span className="sr-only">{` · ${source}`}</span>
            </div>
          ) : (
            <>
              <div className="font-semibold text-sm leading-tight">{warning.headline}</div>
              <div className="text-xs mt-0.5">
                {source} · {severity}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(compact || hasDetails) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={buttonClass}
              aria-expanded={expanded}
              aria-label={expanded ? t('tile.collapse') : t('tile.expand')}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
          <button
            onClick={() => onDismiss(warning.id)}
            className={buttonClass}
            aria-label={t('nina.dismiss', 'Dismiss')}
          >
            ✕
          </button>
        </div>
      </div>
      {expanded && hasDetails && (
        <div className={compact ? 'mt-2 text-xs space-y-2 max-h-[40vh] overflow-y-auto overscroll-contain' : 'mt-2 text-sm space-y-2'}>
          {warning.description && <p>{warning.description}</p>}
          {warning.instruction && (
            <p className="font-medium">{warning.instruction}</p>
          )}
        </div>
      )}
    </div>
  );
}
