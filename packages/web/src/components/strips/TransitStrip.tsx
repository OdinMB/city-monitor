import { memo, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTransit } from '../../hooks/useTransit.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatClockTime } from '../../lib/format-time.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { SourceText } from '../SourceText.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import { hvvLineStyle, isHvvFerry, type LineStyle } from '../../lib/hvv-lines.js';
import type { TransitAlert } from '../../lib/api.js';

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** U-Bahn, S-Bahn, AKN and regional trains, in any city: `U3`, `S41`, `A1`, `RE7`, `RB61`. */
const RAIL_LINE = /^(U|S|A|RE|RB)\d+$/i;

/**
 * The tile's order: severity first; within it unplanned items (cancellations,
 * disruptions, delays) before planned work; then alerts touching rail or a
 * ferry before bus-only ones. The sort is stable, so the server's order
 * decides the rest.
 */
function rank(alert: TransitAlert, isFerry?: (line: string) => boolean): [number, number, number] {
  const lines = alert.lines ?? [alert.line];
  const rail = lines.some((l) => RAIL_LINE.test(l.trim()) || !!isFerry?.(l));
  return [SEVERITY_ORDER[alert.severity] ?? 3, alert.type === 'planned-work' ? 1 : 0, rail ? 0 : 1];
}

function sortAlerts(alerts: TransitAlert[], isFerry?: (line: string) => boolean): TransitAlert[] {
  const ranked = alerts.map((alert) => ({ alert, key: rank(alert, isFerry) }));
  ranked.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  return ranked.map((r) => r.alert);
}

const COLLAPSED_MAX = 6;
const EXPANDED_MAX = 12;

/** The line's mode tag; each reaches 4.5:1 for the badge's 12px bold text (globals.css). */
function getLineBadgeColor(line: string): string {
  if (line.startsWith('U')) return 'tag-line-u';
  if (line.startsWith('S')) return 'tag-line-s';
  if (line.startsWith('M') || line.toLowerCase().includes('tram')) return 'tag-line-tram';
  return 'tag-line-other';
}

function getSeverityDot(severity: TransitAlert['severity']): string {
  if (severity === 'high') return 'bg-severity-high';
  if (severity === 'medium') return 'bg-severity-medium';
  return 'bg-severity-low';
}

/**
 * One disruption. Collapsed, the summary is clamped to a single line; the row
 * is a button that expands in place to the full summary, the full remark text
 * (when it differs from the summary) and the station the remark was reported at.
 */
const AlertRow = memo(function AlertRow({ alert, lineStyle }: { alert: TransitAlert; lineStyle?: (line: string) => LineStyle | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const detail = alert.detail?.trim();
  const showDetail = !!detail && detail !== alert.message.trim();

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        className="w-full flex items-start gap-2 py-1.5 text-start cursor-pointer appearance-none bg-transparent rounded-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${getSeverityDot(alert.severity)}`} />
        <span className="flex items-center gap-1 shrink-0 flex-wrap">
          {(alert.lines ?? [alert.line]).map((ln) => {
            const own = lineStyle?.(ln);
            return (
              <span
                key={ln}
                className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold leading-none ${own ? '' : getLineBadgeColor(ln)}`}
                style={own ? { backgroundColor: own.background, color: own.color, boxShadow: own.border ? `inset 0 0 0 1px ${own.border}` : undefined } : undefined}
              >
                {ln}
              </span>
            );
          })}
        </span>
        {/* The operator's German text keeps its own direction in Arabic, so
            the clamped line is cut at its end. The text is only as wide as it
            needs and the chevron takes the free space (ms-auto), so in Arabic
            it stays next to its line badges. */}
        <SourceText as="span" className={`min-w-0 text-sm text-gray-700 dark:text-gray-300 ${open ? 'wrap-anywhere' : 'line-clamp-1'}`}>
          {alert.message}
        </SourceText>
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-1 ms-auto shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div id={detailId} className="ps-4 pb-2 space-y-1 text-xs text-gray-600 dark:text-gray-400 wrap-anywhere">
          {showDetail && <p className="whitespace-pre-line"><SourceText>{detail}</SourceText></p>}
          {alert.station && (
            <p>
              <span className="font-medium">{t('panel.transit.station')}:</span> <SourceText>{alert.station}</SourceText>
            </p>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * What the tile says when there are no alerts. "All clear" only for fresh
 * data, with the time of the check; with no data at all (nothing ingested
 * yet, or no transit source for the city: the API sends `fetchedAt: null`)
 * it says so; on stale data only the "may be outdated" note.
 */
function EmptyState({ hasData, outdatedNote, checkedTime }: { hasData: boolean; outdatedNote: string | null; checkedTime: string }) {
  const { t } = useTranslation();
  if (!hasData) return <p className="text-sm text-muted py-2 text-center flex-1">{t('panel.transit.noData')}</p>;
  if (outdatedNote) return <p className="text-sm text-warning py-2 text-center flex-1">{outdatedNote}</p>;
  return (
    <div className="py-2 text-center flex-1">
      <p className="text-sm text-muted">{t('panel.transit.allClear')}</p>
      <p className="text-xs text-muted mt-0.5">{t('panel.transit.checkedAt', { time: checkedTime })}</p>
    </div>
  );
}

// Past this age the footer says "outdated" and the tile no longer says "all clear".
const FRESH_MAX_AGE = staleAfter('transit');

/**
 * What a city's transit source requires on the tile itself, keyed by city ID
 * because the web config does not know the provider. Hamburg's Geofox terms
 * (hvv.de, "Datenabruf"): name the origin of the content, add "ohne Gewähr",
 * link visibly to hvv.de, and draw lines as hvv does. The credit texts are
 * translation keys; each language keeps the words "ohne Gewähr".
 */
const CITY_SOURCE: Readonly<Record<string, {
  creditKey: string;
  noteKey: string;
  url: string;
  lineStyle: (line: string) => LineStyle | null;
  /** Ferries named by number only (Hamburg's HADAG lines), ranked with rail. */
  isFerry?: (line: string) => boolean;
}>> = {
  hamburg: { creditKey: 'panel.transit.hvvSource', noteKey: 'panel.transit.noGuarantee', url: 'https://www.hvv.de/', lineStyle: hvvLineStyle, isFerry: isHvvFerry },
};

export function TransitStrip({ expanded = false, onExpand }: { expanded?: boolean; onExpand?: () => void }) {
  const { id: cityId, timezone } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useTransit(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);
  const source = CITY_SOURCE[cityId];

  const alerts = data ?? [];
  const sorted = sortAlerts(alerts, source?.isFerry);

  const limit = expanded ? EXPANDED_MAX : COLLAPSED_MAX;
  const visible = sorted.slice(0, limit);
  const hiddenCount = sorted.length - visible.length;

  if (isError) return <StripErrorFallback domain={t('panel.transit.title')} onRetry={refetch} />;

  if (isLoading) return <Skeleton lines={4} />;

  const checkedTime = fetchedAt ? formatClockTime(fetchedAt, i18n.language, timezone) : '';
  const outdatedNote = isStale ? t('panel.transit.mayBeOutdated', { time: checkedTime }) : null;

  return (
    <>
      {sorted.length === 0 ? (
        <EmptyState hasData={!!fetchedAt} outdatedNote={outdatedNote} checkedTime={checkedTime} />
      ) : (
        <div>
          {outdatedNote && <p className="text-xs text-warning pb-1.5">{outdatedNote}</p>}
          {visible.map((alert) => (
            <AlertRow key={alert.id} alert={alert} lineStyle={source?.lineStyle} />
          ))}
          {/* pb-0.5 -mb-0.5: a 24px target (WCAG 2.5.8) without moving the text
              or the footer; the extra 2px sits below, clear of the rows. */}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onExpand}
              className="w-full text-xs text-muted text-center pt-1.5 pb-0.5 -mb-0.5 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              +{hiddenCount} {t('panel.transit.more')}
            </button>
          )}
        </div>
      )}
      {agoText && (
        <TileFooter stale={isStale}>
          <span className="text-center">
            {source && (
              <>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">{t(source.creditKey)}</a>
                {' · '}
                {t(source.noteKey)}
                {' · '}
              </>
            )}
            {t('stale.updated', { time: agoText })}
          </span>
        </TileFooter>
      )}
    </>
  );
}
