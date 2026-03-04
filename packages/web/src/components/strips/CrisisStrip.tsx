import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabKeys } from '../../hooks/useTabKeys.js';

type Tab = 'citywide' | 'local';

/* ── Data ──────────────────────────────────────────────── */

type Category = 'crisis' | 'violence' | 'children' | 'drugs' | 'lgbtq';

interface CrisisService {
  category: Category;
  nameKey: string;
  germanName: string; // shown on hover as native tooltip
  phone: string;
  hoursKey?: string; // i18n key; undefined = no hours shown
}

interface KrisendienstRegion {
  region: number;
  districts: string[];
  phone: string;
}

const CATEGORY_COLORS: Record<Category, string> = {
  crisis: 'bg-red-500',
  violence: 'bg-orange-500',
  children: 'bg-blue-500',
  drugs: 'bg-purple-500',
  lgbtq: 'bg-pink-500',
};

const SERVICES: CrisisService[] = [
  { category: 'crisis', nameKey: 'telefonSeelsorge', germanName: 'TelefonSeelsorge', phone: '0800 111 0 111', hoursKey: 'hours24_7' },
  { category: 'crisis', nameKey: 'krisendienst', germanName: 'Berliner Krisendienst', phone: '030 390 63-90', hoursKey: 'hoursDaily' },
  { category: 'violence', nameKey: 'bigHotline', germanName: 'BIG Hotline', phone: '030 611 03 00', hoursKey: 'hours24_7' },
  { category: 'children', nameKey: 'kindernotdienst', germanName: 'Kindernotdienst', phone: '030 61 00 61', hoursKey: 'hours24_7' },
  { category: 'children', nameKey: 'jugendnotdienst', germanName: 'Jugendnotdienst', phone: '030 61 00 62', hoursKey: 'hours24_7' },
  { category: 'children', nameKey: 'kinderJugendtelefon', germanName: 'Kinder- und Jugendtelefon', phone: '116 111', hoursKey: 'hoursMoSa' },
  { category: 'drugs', nameKey: 'drogennotdienst', germanName: 'Drogennotdienst', phone: '030 192 37', hoursKey: 'hours24_7' },
  { category: 'lgbtq', nameKey: 'maneo', germanName: 'Maneo', phone: '030 216 33 36' },
  { category: 'lgbtq', nameKey: 'schwulenberatung', germanName: 'Schwulenberatung', phone: '030 233 690 70' },
];

const KRISENDIENST_REGIONS: KrisendienstRegion[] = [
  { region: 1, districts: ['Charlottenburg-Wilmersdorf', 'Steglitz-Zehlendorf'], phone: '030 390 63-10' },
  { region: 2, districts: ['Kreuzberg', 'Friedrichshain', 'Treptow-Köpenick'], phone: '030 390 63-20' },
  { region: 3, districts: ['Mitte', 'Tiergarten', 'Wedding'], phone: '030 390 63-30' },
  { region: 4, districts: ['Schöneberg', 'Tempelhof'], phone: '030 390 63-40' },
  { region: 5, districts: ['Neukölln'], phone: '030 390 63-50' },
  { region: 6, districts: ['Reinickendorf'], phone: '030 390 63-60' },
  { region: 7, districts: ['Spandau'], phone: '030 390 63-70' },
  { region: 8, districts: ['Marzahn-Hellersdorf', 'Lichtenberg'], phone: '030 390 63-80' },
  { region: 9, districts: ['Pankow'], phone: '030 390 63-90' },
];

const COLLAPSED_COUNT = 4;

/* ── Component ─────────────────────────────────────────── */

export function CrisisStrip({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('citywide');

  const tabs: { key: Tab; label: string }[] = useMemo(() => [
    { key: 'citywide', label: t('panel.crisis.tab.citywide') },
    { key: 'local', label: t('panel.crisis.tab.local') },
  ], [t]);
  const tabIdx = tabs.findIndex((m) => m.key === tab);
  const selectByIdx = useCallback((i: number) => setTab(tabs[i]!.key), [tabs]);
  const { setTabRef, onKeyDown } = useTabKeys(tabs.length, tabIdx, selectByIdx);

  const visibleServices = expanded ? SERVICES : SERVICES.slice(0, COLLAPSED_COUNT);

  return (
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
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div id="crisis-panel" role="tabpanel" aria-labelledby={`crisis-tab-${tab}`}>
        {tab === 'citywide' ? (
          <div className="space-y-1.5">
            {visibleServices.map((s) => (
              <div key={s.phone} className="flex items-center gap-2 py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_COLORS[s.category]}`} />
                <div className="flex-1 min-w-0" title={s.germanName}>
                  <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">
                    {t(`panel.crisis.service.${s.nameKey}`)}
                  </div>
                </div>
                {s.hoursKey && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    {t(`panel.crisis.${s.hoursKey}`)}
                  </span>
                )}
                <a
                  href={`tel:${s.phone.replace(/[\s-]/g, '')}`}
                  className="shrink-0 text-[12px] font-semibold tabular-nums text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {s.phone}
                </a>
              </div>
            ))}
            {!expanded && SERVICES.length > COLLAPSED_COUNT && (
              <button
                onClick={onExpand}
                className="w-full pt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
              >
                {t('panel.crisis.showMore', { count: SERVICES.length - COLLAPSED_COUNT })}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              {t('panel.crisis.localNote')}
            </p>
            {KRISENDIENST_REGIONS.map((r) => (
              <div key={r.region} className="flex items-start gap-2 py-1">
                <span className="shrink-0 text-[11px] font-bold text-gray-400 dark:text-gray-500 w-4 text-right tabular-nums">
                  {r.region}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-600 dark:text-gray-400 truncate">
                    {r.districts.join(', ')}
                  </div>
                </div>
                <a
                  href={`tel:${r.phone.replace(/[\s-]/g, '')}`}
                  className="shrink-0 text-[12px] font-semibold tabular-nums text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {r.phone}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
