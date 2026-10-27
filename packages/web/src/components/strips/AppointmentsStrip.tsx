import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useAppointments } from '../../hooks/useAppointments.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { safeUrl } from '../../lib/safe-url.js';
import { forwardArrow } from '../../lib/bidi.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { BuergeramtService } from '../../lib/api.js';

/** Each service status's signal colour (globals.css): the dot's fill and the days figure's text. */
const STATUS_COLORS: Record<BuergeramtService['status'], { text: string; fill: string }> = {
  available: { text: 'text-signal-good', fill: 'bg-signal-good' },
  scarce: { text: 'text-signal-caution', fill: 'bg-signal-caution' },
  none: { text: 'text-signal-bad', fill: 'bg-signal-bad' },
  unknown: { text: 'text-signal-unknown', fill: 'bg-signal-unknown' },
};

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00Z');
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 86_400_000));
}

const ServiceRow = memo(function ServiceRow({ service, t }: { service: BuergeramtService; t: (k: string, opts?: Record<string, unknown>) => string }) {
  const color = STATUS_COLORS[service.status];
  const statusKey = service.status;
  const days = service.earliestDate ? daysUntil(service.earliestDate) : null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Status dot */}
      <span className={`shrink-0 w-2 h-2 rounded-full ${color.fill}`} />

      {/* Service name */}
      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
        {t(`panel.appointments.service.${service.serviceId}`, { defaultValue: service.name })}
      </span>

      {/* Days until / status */}
      <span className={`shrink-0 text-xs tabular-nums ${color.text}`}>
        {statusKey === 'unknown'
          ? '—'
          : days != null
            ? days === 0
              ? t('panel.appointments.today')
              : t('panel.appointments.inDays', { count: days })
            : t('panel.appointments.noSlots')}
      </span>
    </div>
  );
});

const STATUS_PRIORITY: Record<string, number> = { none: 0, scarce: 1, unknown: 2, available: 3 };
const COLLAPSED_SERVICES = 5;
const EXPANDED_SERVICES = 10;

const FRESH_MAX_AGE = staleAfter('appointments');

export function AppointmentsStrip({ expanded = false, onExpand }: { expanded?: boolean; onExpand?: () => void }) {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useAppointments(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);
  const arrow = forwardArrow(i18n.language);

  if (isLoading) {
    return <Skeleton lines={4} />;
  }
  if (isError) return <StripErrorFallback domain={t('panel.appointments.title')} onRetry={refetch} />;

  if (!data || data.services.length === 0) {
    return (
      <div className="text-center py-2">
        <p className="text-sm text-muted">{t('panel.appointments.empty')}</p>
        <a
          href="https://service.berlin.de/terminvereinbarung/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-link hover:underline mt-1 inline-block"
        >
          {t('panel.appointments.bookAppointment')} {arrow}
        </a>
      </div>
    );
  }

  // Overall summary: worst status across all services
  const hasNone = data.services.some((s) => s.status === 'none');
  const allUnknown = data.services.every((s) => s.status === 'unknown');
  const hasScarce = data.services.some((s) => s.status === 'scarce');

  const summaryKey = allUnknown
    ? 'unknown'
    : hasNone
      ? 'someUnavailable'
      : hasScarce
        ? 'someScarce'
        : 'allAvailable';

  const summaryColor = allUnknown
    ? 'text-muted'
    : hasNone
      ? 'text-danger'
      : hasScarce
        ? 'text-caution'
        : 'text-success';

  const sorted = [...data.services].sort(
    (a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9),
  );

  const limit = expanded ? EXPANDED_SERVICES : COLLAPSED_SERVICES;
  const visible = sorted.slice(0, limit);
  const hiddenCount = sorted.length - visible.length;

  return (
    <>
      <div className="space-y-2.5 flex-1">
        {/* Summary */}
        <p className={`text-sm text-center font-medium ${summaryColor}`}>
          {t(`panel.appointments.summary.${summaryKey}`)}
        </p>

        {/* Service rows */}
        {visible.map((service) => (
          <ServiceRow key={service.serviceId} service={service} t={t} />
        ))}

        {/* pt-2 -mt-1: a 24px target (WCAG 2.5.8) with the text and the rows
            below where they were; the extra 4px sits in the gap above. */}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={onExpand}
            className="w-full text-xs text-muted text-center pt-2 -mt-1 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
          >
            +{hiddenCount} {t('panel.appointments.more')}
          </button>
        )}

        {/* Booking link */}
        <div className="pt-1 text-center">
          <a
            href={safeUrl(data.bookingUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-link hover:underline"
          >
            {t('panel.appointments.bookAppointment')} {arrow}
          </a>
        </div>
      </div>
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
