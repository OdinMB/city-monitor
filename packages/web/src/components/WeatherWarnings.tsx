import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { WeatherAlert } from '@city-monitor/shared';
import { useCityConfig } from '../hooks/useCityConfig.js';
import { useWarningsInForce } from '../hooks/useWarningsInForce.js';
import { formatWarningEnd, warningLevel, type WarningLevel } from '../lib/weather-warnings.js';
import { SourceText } from './SourceText.js';

const ORANGE = {
  badge: 'bg-orange-500 text-gray-950',
  row: 'bg-orange-50 border-orange-300 dark:bg-orange-950 dark:border-orange-800',
};

/**
 * Colours of each warning level, after DWD's: orange, red, violet. The badge
 * is solid and the same in both themes, with its text at 4.5:1 or more; the
 * row is a tint of the level, on which the row's gray text keeps 9:1 or more.
 * A warning of unknown level looks like the lowest one.
 */
const LEVEL_STYLES: Record<WarningLevel, { badge: string; row: string }> = {
  moderate: ORANGE,
  severe: {
    badge: 'bg-red-700 text-white',
    row: 'bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-800',
  },
  extreme: {
    badge: 'bg-purple-700 text-white',
    row: 'bg-purple-50 border-purple-300 dark:bg-purple-950 dark:border-purple-800',
  },
  unknown: ORANGE,
};

function WarningIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** A warning sign and a word on the colour of the warning level. */
export function WarningLevelBadge({ level, children, className = '' }: { level: WarningLevel; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded font-semibold leading-tight ${LEVEL_STYLES[level].badge} ${className}`}>
      <WarningIcon />
      {children}
    </span>
  );
}

/**
 * The city's weather warnings still in force, one row each: the level in the
 * UI language, when it ends on the city's clock, DWD's headline (German, as
 * issued) and the source. Renders nothing without any. Text size comes from
 * `className`.
 */
export function WeatherWarningList({ alerts, className = '' }: { alerts: WeatherAlert[]; className?: string }) {
  const { timezone } = useCityConfig();
  const { t, i18n } = useTranslation();
  const inForce = useWarningsInForce(alerts);

  if (inForce.length === 0) return null;
  const now = new Date();

  return (
    <ul aria-label={t('panel.weather.alerts')} className={`space-y-2 ${className}`}>
      {inForce.map((alert, i) => {
        const level = warningLevel(alert.severity);
        return (
          <li key={i} className={`rounded border p-2 ${LEVEL_STYLES[level].row}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <WarningLevelBadge level={level} className="px-1.5 py-0.5">
                {t(`panel.weather.warning.level.${level}`)}
              </WarningLevelBadge>
              <span className="text-gray-700 dark:text-gray-300">
                {formatWarningEnd(alert.validUntil, now, timezone, i18n.language, t)}
              </span>
            </div>
            {/* The German headline keeps its own word order in a right-to-left layout */}
            <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100"><SourceText lang="de">{alert.headline}</SourceText></p>
            <p className="mt-0.5 text-gray-700 dark:text-gray-300">{t('panel.weather.warning.source')}</p>
          </li>
        );
      })}
    </ul>
  );
}
