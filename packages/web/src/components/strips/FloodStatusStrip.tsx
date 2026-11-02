import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useFloodStatus } from '../../hooks/useFloodStatus.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { safeUrl } from '../../lib/safe-url.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Ltr } from '../Ltr.js';
import { SourceText } from '../SourceText.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { FloodAlert, FloodGauge } from '../../lib/api.js';

/**
 * The LHP's colour for each gauge class, as its terms ask republishers to use
 * (sent in the API's legend; fixed here so no colour string from the API
 * reaches a style attribute). Shown as a dot next to the class in words.
 */
const LHP_CLASS_COLORS: Record<number, string> = {
  0: '#7CBD5C',
  1: '#ffff00',
  2: '#ffa500',
  3: '#de0000',
  4: '#941094',
};
const NO_DATA_COLOR = '#7b7b7b';

/** The credit the LHP's licence asks for, word for word and as a link, in every UI language. */
const LHP_CREDIT ='Datenquelle: www.hochwasserzentralen.de';
const LHP_URL = 'https://www.hochwasserzentralen.de';

const standFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** "TT.MM.JJJJ hh:mm" in German time, the form the LHP's terms give for the "Stand". */
function formatStand(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : standFormat.format(d).replace(',', '');
}

/** An alert's badge colour by LHP warning class: all-clear, pre-warning, flood and above. */
function alertBadge(level: number): string {
  if (level >= 4) return 'badge-severe';
  if (level >= 2) return 'badge-caution';
  return 'badge-good';
}

function GaugeRow({ gauge }: { gauge: FloodGauge }) {
  const { t } = useTranslation();
  const known = gauge.floodClass !== null;
  const color = known ? LHP_CLASS_COLORS[gauge.floodClass!] : NO_DATA_COLOR;
  const name = (
    <SourceText as="span" className="truncate">{gauge.name}</SourceText>
  );
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 min-w-0">
        <div className="flex">
          <SourceText as="span" className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {gauge.waterBody}
          </SourceText>
        </div>
        <div className="flex text-[11px] text-muted">
          {gauge.url ? (
            <a href={safeUrl(gauge.url)} target="_blank" rel="noopener noreferrer" className="flex min-w-0 hover:underline">{name}</a>
          ) : name}
          {gauge.upstream && (
            <span className="shrink-0 ms-1.5">
              <span className="px-1 py-0.5 rounded text-[9px] font-medium badge-info">{t('panel.floodStatus.upstream')}</span>
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/20 dark:ring-white/20"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {t(known ? `panel.floodStatus.class.${gauge.floodClass}` : 'panel.floodStatus.class.none')}
        </span>
        {known && gauge.floodClass! > 0 && gauge.stateLabel && (
          <SourceText as="span" lang="de" className="text-[11px] text-muted">{gauge.stateLabel}</SourceText>
        )}
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: FloodAlert }) {
  const href = safeUrl(alert.url);
  const headline = <SourceText lang="de">{alert.headline}</SourceText>;
  return (
    <li className="text-xs">
      <div className="flex items-start gap-1.5">
        <span className={`shrink-0 px-1 py-0.5 rounded text-[9px] font-medium leading-tight ${alertBadge(alert.level)}`}>
          <SourceText lang="de">{alert.levelName}</SourceText>
        </span>
        <span className="min-w-0 font-medium text-gray-900 dark:text-gray-100">
          {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{headline}</a> : headline}
        </span>
      </div>
      {alert.area && <SourceText as="div" lang="de" className="text-[11px] text-muted mt-0.5">{alert.area}</SourceText>}
    </li>
  );
}

const FRESH_MAX_AGE = staleAfter('floodStatus');

export function FloodStatusStrip() {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useFloodStatus(cityId);
  const { t } = useTranslation();
  const { isStale } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) return <Skeleton lines={3} />;
  if (isError) return <StripErrorFallback domain={t('panel.floodStatus.title')} onRetry={refetch} />;
  if (!data || data.gauges.length === 0) {
    return <p className="text-sm text-muted py-2 text-center">{t('panel.floodStatus.empty')}</p>;
  }

  return (
    <>
      <div className="space-y-2 flex-1">
        {data.gauges.map((gauge) => <GaugeRow key={gauge.id} gauge={gauge} />)}
        <div className="pt-2 border-t border-border-subtle">
          {data.alerts.length > 0 ? (
            <ul className="space-y-1.5" aria-label={t('panel.floodStatus.warnings')}>
              {data.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
            </ul>
          ) : (
            <p className="text-xs text-muted">{t('panel.floodStatus.noWarnings')}</p>
          )}
        </div>
      </div>
      <TileFooter stale={isStale}>
        <span>
          <a href={LHP_URL} target="_blank" rel="noopener noreferrer" className="hover:underline" lang="de">{LHP_CREDIT}</a>
          {' · '}
          {t('panel.floodStatus.asOf')} <Ltr>{formatStand(data.updated)}</Ltr>
        </span>
      </TileFooter>
    </>
  );
}
