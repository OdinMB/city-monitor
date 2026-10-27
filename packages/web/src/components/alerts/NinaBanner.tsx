import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNina } from '../../hooks/useNina.js';
import type { NinaWarning } from '../../lib/api.js';

// Colour roles (globals.css), each pair at 4.5:1 for the banner's 12px text.
const SEVERITY_STYLES: Record<string, string> = {
  extreme: 'alert-extreme',
  severe: 'alert-severe',
  moderate: 'alert-moderate',
  minor: 'alert-minor',
};

const SEVERITY_ICONS: Record<string, string> = {
  extreme: '🚨',
  severe: '⚠️',
  moderate: '⚠️',
  minor: 'ℹ️',
};

// min-w-6 min-h-6: each button is at least a 24px tap target (WCAG 2.5.8).
const BUTTON = 'inline-flex items-center justify-center min-w-6 min-h-6 p-1 rounded hover:bg-white/20 text-xs';

/**
 * Severe and extreme warnings open with what to do in view. Minor and moderate
 * ones, and an all-clear (message type Cancel) of any severity, stay one line
 * until expanded. An update (type Update) is the current text of its warning,
 * so it is treated by its severity like any other.
 */
function isUrgent(warning: NinaWarning): boolean {
  return (warning.severity === 'severe' || warning.severity === 'extreme') && !/^cancel$/i.test(warning.type);
}

/** A dismissal holds for one version of a warning: once it is updated, it shows again. */
function dismissalKey(warning: NinaWarning): string {
  return `${warning.id}@${warning.version}`;
}

/** Dismissal keys by city id, as stored. */
type Dismissals = Record<string, string[]>;

function readDismissals(): Dismissals {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('nina-dismissed') ?? '{}');
    // An array is the earlier list of bare ids, with no versions: it is
    // dropped, so a warning dismissed under it shows once more.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((key) => typeof key === 'string'),
      ),
    );
  } catch {
    return {};
  }
}

function writeDismissals(dismissals: Dismissals) {
  try {
    if (Object.keys(dismissals).length === 0) localStorage.removeItem('nina-dismissed');
    else localStorage.setItem('nina-dismissed', JSON.stringify(dismissals));
  } catch {
    // Storage blocked: the dismissals still hold for this page view.
  }
}

/** The keys of warnings the city's current list holds; all of them while there is no current list. */
function keepListed(keys: string[], current: NinaWarning[] | null): string[] {
  if (!current) return keys;
  const listed = new Set(current.map(dismissalKey));
  return keys.filter((key) => listed.has(key));
}

/** The dismissals with this city's keys set to `keys`, or without the city when there are none. */
function withCityKeys(dismissals: Dismissals, cityId: string, keys: string[]): Dismissals {
  const others = Object.fromEntries(Object.entries(dismissals).filter(([city]) => city !== cityId));
  return keys.length > 0 ? { ...others, [cityId]: keys } : others;
}

/**
 * This city's dismissed warnings. Once the city's own list has loaded, the
 * dismissals of warnings it no longer holds (ended, or replaced by a newer
 * version) are dropped from storage, so it keeps only what can still hide
 * something. A placeholder list is another city's, shown while this one loads.
 */
function useDismissals(cityId: string, warnings: NinaWarning[] | undefined, listIsCurrent: boolean) {
  const [dismissals, setDismissals] = useState(readDismissals);
  const current = warnings && listIsCurrent ? warnings : null;
  const dismissed = useMemo(() => keepListed(dismissals[cityId] ?? [], current), [dismissals, cityId, current]);

  useEffect(() => {
    // Another tab may have dismissed a warning since this one read storage:
    // keep what storage holds as well, so this tab does not write over it.
    const stored = readDismissals();
    const keys = keepListed([...new Set([...(stored[cityId] ?? []), ...dismissed])], current);
    writeDismissals(withCityKeys(stored, cityId, keys));
  }, [dismissed, cityId, current]);

  const dismiss = useCallback(
    (warning: NinaWarning) => {
      setDismissals((prev) => ({ ...prev, [cityId]: [...(prev[cityId] ?? []), dismissalKey(warning)] }));
    },
    [cityId],
  );

  return { dismissed, dismiss };
}

export function NinaBanner() {
  const { id: cityId, country } = useCityConfig();
  const { data: warnings, isPlaceholderData } = useNina(cityId);
  const { dismissed, dismiss } = useDismissals(cityId, warnings, !isPlaceholderData);

  // Only show for German cities
  if (country !== 'DE') return null;

  const active = (warnings ?? []).filter((w) => !dismissed.includes(dismissalKey(w)));
  if (active.length === 0) return null;

  return (
    <div className="space-y-2" aria-live="polite">
      {active.map((warning) => (
        <NinaWarningCard key={dismissalKey(warning)} warning={warning} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function NinaWarningCard({ warning, onDismiss }: { warning: NinaWarning; onDismiss: (warning: NinaWarning) => void }) {
  const { t, i18n } = useTranslation();
  const urgent = isUrgent(warning);
  const [expanded, setExpanded] = useState(urgent);
  const style = SEVERITY_STYLES[warning.severity] ?? SEVERITY_STYLES.minor;
  const icon = SEVERITY_ICONS[warning.severity] ?? '';
  const severity = t(`nina.severity.${warning.severity}`, warning.severity);
  const headline = warning.headline;
  const toggleLabel = warning.instruction
    ? t(expanded ? 'nina.hideInstruction' : 'nina.showInstruction', { headline })
    : t(expanded ? 'nina.hideDetails' : 'nina.showDetails', { headline });
  // The warning is not translated: outside German, say that it is the official text.
  const meta = [warning.source.toUpperCase(), urgent ? severity : null, i18n.language === 'de' ? null : t('nina.officialGerman')]
    .filter(Boolean)
    .join(' · ');

  const buttons = (
    <div className="flex items-center gap-1 shrink-0 ms-auto">
      {(warning.description || warning.instruction) && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={BUTTON}
          aria-expanded={expanded}
          aria-label={toggleLabel}
        >
          {expanded ? '▲' : '▼'}
        </button>
      )}
      <button type="button" onClick={() => onDismiss(warning)} className={BUTTON} aria-label={t('nina.dismiss', { headline })}>
        ✕
      </button>
    </div>
  );

  // The warning's own text is German. Each part sits in a <bdi>, or runs in its
  // own direction where it is cut to one line, so an Arabic page keeps its word
  // order; lang="de" has a screen reader read it as German.
  return (
    <div className={`nina-warning rounded-lg ${urgent ? 'px-4 py-3' : 'px-3 py-1.5'} ${style}`} role={urgent ? 'alert' : undefined}>
      {urgent ? (
        <div className="flex items-start gap-2">
          <span className="text-lg leading-tight shrink-0" aria-hidden="true">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight"><bdi lang="de">{headline}</bdi></div>
            <div className="text-xs mt-0.5">{meta}</div>
          </div>
          {buttons}
        </div>
      ) : (
        // One line until expanded, then the whole headline. It is only as wide
        // as its text and gives the free space to the buttons (ms-auto), so it
        // stays beside its severity; baseline alignment keeps the buttons on
        // its first line when it wraps.
        <div className="flex items-baseline gap-2">
          <span className="shrink-0" aria-hidden="true">{icon}</span>
          <span className="shrink-0 text-xs font-medium">{severity}</span>
          <span dir="auto" lang="de" className={`min-w-0 text-sm font-semibold ${expanded ? '' : 'truncate'}`}>
            {headline}
          </span>
          {buttons}
        </div>
      )}
      {expanded && (
        <div className="mt-2 space-y-2 text-sm">
          {!urgent && <div className="text-xs">{meta}</div>}
          {warning.instruction && (
            <p className="font-medium"><bdi lang="de">{warning.instruction}</bdi></p>
          )}
          {warning.description && <p><bdi lang="de">{warning.description}</bdi></p>}
        </div>
      )}
    </div>
  );
}
