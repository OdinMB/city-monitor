import { useState, useMemo, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useTabKeys } from '../../hooks/useTabKeys.js';
import { TileFooter } from '../layout/TileFooter.js';
import { Ltr } from '../Ltr.js';
import { SourceText } from '../SourceText.js';
import { getCrisisDirectory, type CrisisCategory, type CrisisService, type LocalCrisisService } from './crisis-services.js';

type Tab = 'citywide' | 'local';

const CATEGORY_COLORS: Record<CrisisCategory, string> = {
  emergency: 'bg-red-600',
  crisis: 'bg-red-500',
  violence: 'bg-orange-500',
  children: 'bg-blue-500',
  drugs: 'bg-purple-500',
  lgbtq: 'bg-pink-500',
};

const COLLAPSED_COUNT = 4;

const telHref = (phone: string) => `tel:${phone.replace(/[\s-]/g, '')}`;

/* ── Component ─────────────────────────────────────────── */

/**
 * One service: its name with a link to its official page, its hours where
 * certain, and its number as a `tel:` link. The name wraps rather than being
 * cut off, and the hours move under it, still at the row's end, when the tile
 * is too narrow for both. Both links are 24px targets (WCAG 2.5.8); -my-1
 * keeps the row height.
 */
function ServiceRow({ service, emphasis }: { service: CrisisService; emphasis?: boolean }) {
  const { t } = useTranslation();
  const name = t(`panel.crisis.service.${service.nameKey}`);
  return (
    <li className="flex items-center gap-2 py-1">
      <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_COLORS[service.category]}`} />
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <div className="min-w-0 flex items-center gap-0.5">
          <span title={service.germanName} className="min-w-0 break-words text-[12px] leading-4 font-medium text-gray-900 dark:text-gray-100">
            {name}
          </span>
          <a
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('panel.crisis.website', { name })}
            className="shrink-0 inline-flex items-center justify-center min-w-6 min-h-6 -my-1 text-[11px] text-link hover:underline"
          >
            ↗
          </a>
        </div>
        {service.hoursKey && (
          <span className="ms-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {t(`panel.crisis.${service.hoursKey}`)}
          </span>
        )}
      </div>
      <a
        href={telHref(service.phone)}
        className={`shrink-0 inline-flex items-center min-h-6 -my-1 tabular-nums text-link hover:underline ${
          emphasis ? 'text-base font-bold' : 'text-[12px] font-semibold'
        }`}
      >
        <Ltr>{service.phone}</Ltr>
      </a>
    </li>
  );
}

/** The city-wide services, the first few while collapsed, and the city's note. */
function ServiceList({ services, noteKey, expanded, onExpand }: {
  services: CrisisService[]; noteKey?: string; expanded: boolean; onExpand: () => void;
}) {
  const { t } = useTranslation();
  const visible = expanded ? services : services.slice(0, COLLAPSED_COUNT);
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1.5">
        {visible.map((s) => <ServiceRow key={s.phone} service={s} />)}
      </ul>
      {!expanded && services.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={onExpand}
          className="w-full pt-2 text-xs text-muted hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
        >
          {t('panel.crisis.showMore', { count: services.length - COLLAPSED_COUNT })}
        </button>
      )}
      {noteKey && <p className="pt-1 text-[11px] text-muted">{t(`panel.crisis.note.${noteKey}`)}</p>}
    </div>
  );
}

/** A regional service's note and its number for each district. */
function LocalPanel({ local }: { local: LocalCrisisService }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted mb-2">
        {/* The on-call number sits in a translated sentence, so it goes in
            as a value wrapped in the same isolate as <Ltr>. */}
        <Trans
          t={t}
          i18nKey="panel.crisis.localNote"
          values={{ onCall: local.onCall }}
          components={{ ltr: <bdi dir="ltr" /> }}
        />
      </p>
      <ul aria-label={t('panel.crisis.regionalSites')} className="space-y-1.5">
        {local.sites.map((site) => (
          <li key={site.phone} className="flex items-center gap-2 py-1">
            {/* German district names: isolated so an Arabic page keeps their
                order, inside a block so they still start at the page's start side */}
            <div className="flex-1 min-w-0 text-[11px] text-gray-600 dark:text-gray-400">
              <SourceText lang="de">{site.districts.join(', ')}</SourceText>
            </div>
            <a
              href={telHref(site.phone)}
              className="shrink-0 inline-flex items-center min-h-6 -my-1 text-[12px] font-semibold tabular-nums text-link hover:underline"
            >
              <Ltr>{site.phone}</Ltr>
            </a>
          </li>
        ))}
      </ul>
      <a
        href={local.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 min-h-6 text-[11px] text-link hover:underline"
      >
        {t('panel.crisis.website', { name: local.name })}
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}

/**
 * The city's crisis hotline directory (crisis-services.ts): emergency numbers,
 * then the city-wide services, and for a city with a regional service (Berlin's
 * Krisendienst) a second tab with its number per district. Renders nothing for
 * a city without a directory.
 */
export function CrisisStrip({ cityId, expanded, onExpand }: { cityId: string; expanded: boolean; onExpand: () => void }) {
  const { t, i18n } = useTranslation();
  const directory = getCrisisDirectory(cityId);
  const [tab, setTab] = useState<Tab>('citywide');

  const tabs: { key: Tab; label: string }[] = useMemo(() => [
    { key: 'citywide', label: t('panel.crisis.tab.citywide') },
    { key: 'local', label: t('panel.crisis.tab.local') },
  ], [t]);
  const tabIdx = tabs.findIndex((m) => m.key === tab);
  const selectByIdx = useCallback((i: number) => setTab(tabs[i]!.key), [tabs]);
  const { setTabRef, onKeyDown } = useTabKeys(tabs.length, tabIdx, selectByIdx);

  if (!directory) return null;
  const { emergency, services, noteKey, local } = directory;

  const checkedOn = new Date(`${directory.checkedOn}T00:00:00Z`).toLocaleDateString(i18n.language, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  const serviceList = <ServiceList services={services} noteKey={noteKey} expanded={expanded} onExpand={onExpand} />;

  return (
    <>
      {/* Emergency numbers first, on every tab and while collapsed */}
      <ul aria-label={t('panel.crisis.emergency')} className="mb-3 px-2 py-0.5 rounded-lg border border-border">
        {emergency.map((s) => <ServiceRow key={s.phone} service={s} emphasis />)}
      </ul>

      {local ? (
        <>
          {/* Tab selector */}
          <div role="tablist" className="flex gap-0.5 mb-3 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {tabs.map((m, i) => (
              <button
                key={m.key}
                ref={setTabRef(i)}
                id={`crisis-tab-${m.key}`}
                role="tab"
                aria-selected={tab === m.key}
                aria-controls="crisis-panel"
                tabIndex={tab === m.key ? 0 : -1}
                onClick={() => setTab(m.key)}
                onKeyDown={onKeyDown}
                className={`flex-1 px-1.5 py-1 rounded-md text-[11px] font-medium text-center transition-colors ${
                  tab === m.key
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div id="crisis-panel" role="tabpanel" aria-labelledby={`crisis-tab-${tab}`}>
            {tab === 'citywide' ? serviceList : <LocalPanel local={local} />}
          </div>
        </>
      ) : serviceList}
      <TileFooter>{t('panel.crisis.checked', { date: checkedOn })}</TileFooter>
    </>
  );
}
