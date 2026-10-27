import { useState, useMemo, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useTabKeys } from '../../hooks/useTabKeys.js';
import { TileFooter } from '../layout/TileFooter.js';
import { Ltr } from '../Ltr.js';
import { SourceText } from '../SourceText.js';

type Tab = 'citywide' | 'local';

/* ── Data ──────────────────────────────────────────────── */

/**
 * The day the numbers, hours and links below were checked against the
 * services' official pages, by the maintainer, on 2026-10-27. The 112/110,
 * TelefonSeelsorge, Hilfetelefon, Kindernotdienst and Jugendnotdienst entries
 * were not separately re-checked that day; they stand as researched the same
 * day from search excerpts. Set this again whenever the entries are checked.
 */
const CHECKED_ON = '2026-10-27';

type Category = 'emergency' | 'crisis' | 'violence' | 'children' | 'drugs' | 'lgbtq';

interface CrisisService {
  category: Category;
  nameKey: string;
  germanName: string; // shown on hover as native tooltip
  phone: string;
  url: string; // the service's official page
  hoursKey?: string; // i18n key; undefined = no hours shown
}

interface KrisendienstSite {
  districts: string[];
  phone: string;
}

const CATEGORY_COLORS: Record<Category, string> = {
  emergency: 'bg-red-600',
  crisis: 'bg-red-500',
  violence: 'bg-orange-500',
  children: 'bg-blue-500',
  drugs: 'bg-purple-500',
  lgbtq: 'bg-pink-500',
};

const KRISENDIENST_URL = 'https://www.berliner-krisendienst.de/ich-brauche-hilfe/';

/**
 * The Krisendienst's number for all regions: its on-call service at night and
 * on weekends and holidays, information and referral on weekday daytimes (as
 * is each region's own number). Its official page lists no central number.
 */
const KRISENDIENST_ON_CALL = '030 390 63-10';

const EMERGENCY: CrisisService[] = [
  { category: 'emergency', nameKey: 'fireAmbulance', germanName: 'Feuerwehr und Rettungsdienst', phone: '112', url: 'https://www.berliner-feuerwehr.de/' },
  { category: 'emergency', nameKey: 'police', germanName: 'Polizei', phone: '110', url: 'https://www.berlin.de/polizei/' },
];

const SERVICES: CrisisService[] = [
  { category: 'crisis', nameKey: 'telefonSeelsorge', germanName: 'TelefonSeelsorge', phone: '0800 111 0 111', url: 'https://www.telefonseelsorge.de/telefon/', hoursKey: 'hours24_7' },
  { category: 'crisis', nameKey: 'krisendienst', germanName: 'Berliner Krisendienst', phone: KRISENDIENST_ON_CALL, url: KRISENDIENST_URL },
  { category: 'violence', nameKey: 'bigHotline', germanName: 'BIG Hotline', phone: '030 611 03 00', url: 'https://www.big-hotline.de/', hoursKey: 'hours24_7' },
  { category: 'violence', nameKey: 'hilfetelefon', germanName: 'Hilfetelefon Gewalt gegen Frauen', phone: '116 016', url: 'https://www.hilfetelefon.de/', hoursKey: 'hours24_7' },
  { category: 'children', nameKey: 'kindernotdienst', germanName: 'Kindernotdienst', phone: '030 61 00 61', url: 'https://www.berlin.de/notdienst-kinderschutz/', hoursKey: 'hours24_7' },
  { category: 'children', nameKey: 'jugendnotdienst', germanName: 'Jugendnotdienst', phone: '030 61 00 62', url: 'https://www.berlin.de/notdienst-kinderschutz/jugendnotdienst/', hoursKey: 'hours24_7' },
  { category: 'children', nameKey: 'kinderJugendtelefon', germanName: 'Kinder- und Jugendtelefon (Nummer gegen Kummer)', phone: '116 111', url: 'https://www.nummergegenkummer.de/', hoursKey: 'hoursMoSa' },
  { category: 'drugs', nameKey: 'drogennotdienst', germanName: 'Drogennotdienst', phone: '030 192 37', url: 'https://drogennotdienst.de/', hoursKey: 'hours24_7' },
  { category: 'lgbtq', nameKey: 'maneo', germanName: 'Maneo', phone: '030 216 33 36', url: 'https://maneo.de/en/home/', hoursKey: 'hoursDaily17_19' },
  { category: 'lgbtq', nameKey: 'schwulenberatung', germanName: 'Schwulenberatung Berlin', phone: '030 446 688-111', url: 'https://schwulenberatungberlin.de/kontakt/', hoursKey: 'hoursMoFr9_19' },
];

/** The Berliner Krisendienst's regional sites and the districts each one serves. */
const KRISENDIENST_SITES: KrisendienstSite[] = [
  { districts: ['Mitte', 'Friedrichshain-Kreuzberg'], phone: '030 390 63-10' },
  { districts: ['Charlottenburg-Wilmersdorf'], phone: '030 390 63-20' },
  { districts: ['Spandau'], phone: '030 390 63-30' },
  { districts: ['Pankow'], phone: '030 390 63-40' },
  { districts: ['Reinickendorf'], phone: '030 390 63-50' },
  { districts: ['Steglitz-Zehlendorf', 'Tempelhof-Schöneberg'], phone: '030 390 63-60' },
  { districts: ['Lichtenberg', 'Marzahn-Hellersdorf'], phone: '030 390 63-70' },
  { districts: ['Treptow-Köpenick'], phone: '030 390 63-80' },
  { districts: ['Neukölln'], phone: '030 390 63-90' },
];

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

/**
 * Berlin-only crisis hotline directory.
 *
 * All phone numbers and Krisendienst sites are specific to Berlin.
 * This strip should only be mounted for Berlin cities (cityId === 'berlin').
 * If expanding to other cities, the service list and site data must be
 * replaced with city-specific equivalents.
 */
export function CrisisStrip({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>('citywide');

  const tabs: { key: Tab; label: string }[] = useMemo(() => [
    { key: 'citywide', label: t('panel.crisis.tab.citywide') },
    { key: 'local', label: t('panel.crisis.tab.local') },
  ], [t]);
  const tabIdx = tabs.findIndex((m) => m.key === tab);
  const selectByIdx = useCallback((i: number) => setTab(tabs[i]!.key), [tabs]);
  const { setTabRef, onKeyDown } = useTabKeys(tabs.length, tabIdx, selectByIdx);

  const visibleServices = expanded ? SERVICES : SERVICES.slice(0, COLLAPSED_COUNT);
  const checkedOn = new Date(`${CHECKED_ON}T00:00:00Z`).toLocaleDateString(i18n.language, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

  return (
    <>
      {/* Emergency numbers first, on every tab and while collapsed */}
      <ul aria-label={t('panel.crisis.emergency')} className="mb-3 px-2 py-0.5 rounded-lg border border-border">
        {EMERGENCY.map((s) => <ServiceRow key={s.phone} service={s} emphasis />)}
      </ul>

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
        {tab === 'citywide' ? (
          <div className="space-y-1.5">
            <ul className="space-y-1.5">
              {visibleServices.map((s) => <ServiceRow key={s.phone} service={s} />)}
            </ul>
            {!expanded && SERVICES.length > COLLAPSED_COUNT && (
              <button
                type="button"
                onClick={onExpand}
                className="w-full pt-2 text-xs text-muted hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
              >
                {t('panel.crisis.showMore', { count: SERVICES.length - COLLAPSED_COUNT })}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted mb-2">
              {/* The on-call number sits in a translated sentence, so it goes in
                  as a value wrapped in the same isolate as <Ltr>. */}
              <Trans
                t={t}
                i18nKey="panel.crisis.localNote"
                values={{ onCall: KRISENDIENST_ON_CALL }}
                components={{ ltr: <bdi dir="ltr" /> }}
              />
            </p>
            <ul aria-label={t('panel.crisis.regionalSites')} className="space-y-1.5">
              {KRISENDIENST_SITES.map((site) => (
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
              href={KRISENDIENST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 min-h-6 text-[11px] text-link hover:underline"
            >
              {t('panel.crisis.website', { name: 'Berliner Krisendienst' })}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        )}
      </div>
      <TileFooter>{t('panel.crisis.checked', { date: checkedOn })}</TileFooter>
    </>
  );
}
