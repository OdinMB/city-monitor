import { createElement, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrainFront, Wind, Newspaper, TriangleAlert, HeartPulse, Pill, Car, Construction, Landmark, Building2, Building, CloudRain, Droplets, Waves, Home, BarChart3, Siren, Users, UserRound, Globe, Briefcase, Baby, HandCoins, Heart, Volume2, TrainTrack, Plane, Activity, Megaphone, Bike, CarFront, Footprints } from 'lucide';
import { useCommandCenter, type AccidentFilter, type DataLayer, type PoliticalLayer, type SocialLayer, type PopulationLayer, type NoiseLayer, type NewsSubLayer, type EmergencySubLayer, type WaterSubLayer, type TrafficSubLayer } from '../../hooks/useCommandCenter.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useShortcutSettings } from '../../hooks/useShortcutSettings.js';
import { cityLayers, effectiveChoice, effectiveNoiseLayer, effectiveSubLayers } from '../../lib/map-layers.js';
import { indicatorOf, socialAtlasOf } from '../../lib/social-atlas.js';
import type { IconNode } from '../../lib/map-icons.js';
import { ACCIDENT_SEVERITY, BIKE_AVAILABILITY, getNoiseWmsMinZoom, getRentMapLegend } from '../map/constants.js';
import { REPORT_STATUS_COLORS } from '../map/layers/citizen-reports.js';
import { useCitizenReports } from '../../hooks/useCitizenReports.js';
import type { CitizenReportStatus } from '../../lib/api.js';
import { useTrafficAccidents } from '../../hooks/useTrafficAccidents.js';
import { countBySeverity } from '../map/layers/traffic-accidents.js';
import { useTelraamCounts } from '../../hooks/useTelraamCounts.js';
import { TELRAAM_BIKE_SHARE } from '../map/constants.js';

// Each city sees only the layers and sub-layers it has data for (cityLayers).
const LAYER_META: { layer: DataLayer; icon: IconNode; color: string }[] = [
  { layer: 'warnings', icon: TriangleAlert as IconNode, color: '#ef4444' },
  { layer: 'news', icon: Newspaper as IconNode, color: '#6366f1' },
  { layer: 'traffic', icon: Car as IconNode, color: '#8b5cf6' },
  { layer: 'weather', icon: CloudRain as IconNode, color: '#0ea5e9' },
  { layer: 'air-quality', icon: Wind as IconNode, color: '#50C878' },
  { layer: 'noise', icon: Volume2 as IconNode, color: '#f97316' },
  { layer: 'water', icon: Droplets as IconNode, color: '#3b82f6' },
  { layer: 'emergencies', icon: HeartPulse as IconNode, color: '#ef4444' },
  { layer: 'social', icon: BarChart3 as IconNode, color: '#8b5cf6' },
  // After the nine layers with a number key, so the badges stay in order
  { layer: 'bike-sharing', icon: Bike as IconNode, color: '#16a34a' },
  { layer: 'accidents', icon: CarFront as IconNode, color: '#dc2626' },
  { layer: 'population', icon: Users as IconNode, color: '#3b82f6' },
  { layer: 'political', icon: Landmark as IconNode, color: '#64748b' },
  { layer: 'reports', icon: Megaphone as IconNode, color: '#e11d48' },
];

const INACTIVE_COLOR = '#9ca3af';

/** Maps each layer to its keyboard shortcut number (1-9), matching useKeyboardShortcuts.ts LAYER_ORDER */
const LAYER_SHORTCUT: Partial<Record<DataLayer, number>> = {
  warnings: 1, news: 2, traffic: 3, weather: 4, 'air-quality': 5,
  noise: 6, water: 7, emergencies: 8, social: 9,
};

const NEWS_SUB_META: { key: NewsSubLayer; icon: IconNode; color: string }[] = [
  { key: 'news', icon: Newspaper as IconNode, color: '#6366f1' },
  { key: 'police', icon: Siren as IconNode, color: '#f97316' },
];

const EMERGENCY_SUB_META: { key: EmergencySubLayer; icon: IconNode; color: string }[] = [
  { key: 'pharmacies', icon: Pill as IconNode, color: '#22c55e' },
  { key: 'aeds', icon: HeartPulse as IconNode, color: '#ef4444' },
];

const NOISE_SUB_META: { key: NoiseLayer; icon: IconNode; color: string }[] = [
  { key: 'total', icon: Volume2 as IconNode, color: '#f97316' },
  { key: 'road', icon: Car as IconNode, color: '#f97316' },
  { key: 'rail', icon: TrainTrack as IconNode, color: '#f97316' },
  { key: 'air', icon: Plane as IconNode, color: '#f97316' },
];

const WATER_SUB_META: { key: WaterSubLayer; icon: IconNode; color: string }[] = [
  { key: 'levels', icon: Droplets as IconNode, color: '#3b82f6' },
  { key: 'bathing', icon: Waves as IconNode, color: '#06b6d4' },
];

const TRAFFIC_SUB_META: { key: TrafficSubLayer; icon: IconNode; color: string }[] = [
  { key: 'public-transport', icon: TrainFront as IconNode, color: '#f59e0b' },
  { key: 'incidents', icon: Car as IconNode, color: '#8b5cf6' },
  { key: 'roadworks', icon: Construction as IconNode, color: '#d97706' },
  { key: 'telraam', icon: Activity as IconNode, color: '#16a34a' },
];

const ACCIDENT_FILTER_META: { key: AccidentFilter; icon: IconNode; color: string }[] = [
  { key: 'all', icon: CarFront as IconNode, color: '#dc2626' },
  { key: 'bike', icon: Bike as IconNode, color: '#dc2626' },
  { key: 'pedestrian', icon: Footprints as IconNode, color: '#dc2626' },
];

const SOCIAL_SUB_META:{ key: SocialLayer; icon: IconNode; color: string }[] = [
  { key: 'unemployment', icon: Briefcase as IconNode, color: '#ef4444' },
  { key: 'single-parent', icon: Baby as IconNode, color: '#f59e0b' },
  { key: 'welfare', icon: HandCoins as IconNode, color: '#8b5cf6' },
  { key: 'child-poverty', icon: Heart as IconNode, color: '#ec4899' },
  { key: 'rent', icon: Home as IconNode, color: '#10b981' },
];

const POPULATION_SUB_META: { key: PopulationLayer; icon: IconNode; color: string }[] = [
  { key: 'pop-density', icon: Users as IconNode, color: '#3b82f6' },
  { key: 'pop-elderly', icon: UserRound as IconNode, color: '#f59e0b' },
  { key: 'pop-foreign', icon: Globe as IconNode, color: '#06b6d4' },
];

const POLITICAL_SUB_META: { key: PoliticalLayer; icon: IconNode; color: string }[] = [
  { key: 'bezirke', icon: Landmark as IconNode, color: '#64748b' },
  { key: 'bundestag', icon: Building2 as IconNode, color: '#64748b' },
  { key: 'landesparlament', icon: Building as IconNode, color: '#64748b' },
];

function LayerBadge({ icon, color, active, small }: { icon: IconNode; color: string; active: boolean; small?: boolean }) {
  const size = small ? 20 : (active ? 26 : 22);
  const iconSize = small ? 11 : (active ? 15 : 13);
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: small ? 20 : 26, height: small ? 20 : 26 }}>
      <span
        className="inline-flex items-center justify-center rounded transition-all"
        style={{ width: size, height: size, backgroundColor: active ? color : INACTIVE_COLOR }}
      >
        <svg aria-hidden="true" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {icon.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
        </svg>
      </span>
    </span>
  );
}

function SubLayerItem({ icon, color, active, label, onClick, parentColor }: { icon: IconNode; color: string; active: boolean; label: string; onClick: () => void; parentColor?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 w-full ps-8 pe-2 py-1 rounded-lg cursor-pointer transition-colors text-start ${
        active ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      style={active ? { backgroundColor: `${parentColor ?? color}12` } : undefined}
    >
      <LayerBadge icon={icon} color={color} active={active} small />
      <span className={`text-[13px] ${active ? 'text-gray-700 dark:text-gray-300' : 'text-muted'}`}>
        {label}
      </span>
    </button>
  );
}

/**
 * The classes of the city's rent map with the colours its WMS draws them in.
 * Each city has its own: Berlin's Mietspiegel knows simple, medium and good
 * locations, Hamburg's only normal and good ones.
 */
export function RentMapLegend({ cityId }: { cityId: string }) {
  const { t } = useTranslation();
  const legend = getRentMapLegend(cityId);
  if (legend.length === 0) return null;
  return (
    <ul aria-label={t('sidebar.rentLegend.title')} className="ps-9 pe-2 py-1 space-y-0.5">
      {legend.map(({ key, color }) => (
        <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border border-gray-400/60 shrink-0" style={{ backgroundColor: color }} />
          {t(`sidebar.rentLegend.${key}`)}
        </li>
      ))}
    </ul>
  );
}

/** What the bike-sharing circles' colours mean: the bikes available at a station. */
export function BikeSharingLegend() {
  const { t } = useTranslation();
  return (
    <ul aria-label={t('sidebar.bikeLegend.title')} className="ps-9 pe-2 py-1 space-y-0.5">
      {BIKE_AVAILABILITY.map(({ key, color }) => (
        <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border border-gray-400/60 shrink-0" style={{ backgroundColor: color }} />
          {t(`sidebar.bikeLegend.${key}`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * What the street-count circles' colours mean (the share of bikes among the
 * vehicles counted), the day counted, and that the sensors are citizens'.
 * Shares the map's query, so it fetches nothing of its own.
 */
export function TelraamLegend({ cityId }: { cityId: string }) {
  const { t, i18n } = useTranslation();
  const { data } = useTelraamCounts(cityId, true);
  const counts = data?.data;
  const day = counts
    ? new Date(`${counts.date}T12:00:00Z`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    : null;
  return (
    <div className="ps-9 pe-2 py-1">
      {day && <p className="text-[12px] text-muted mb-0.5">{t('sidebar.telraamLegend.day', { day, segments: counts!.segments.length })}</p>}
      <ul aria-label={t('sidebar.telraamLegend.title')} className="space-y-0.5">
        {TELRAAM_BIKE_SHARE.map(({ key, color }) => (
          <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
            <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border border-gray-400/60 shrink-0" style={{ backgroundColor: color }} />
            {t(`sidebar.telraamLegend.${key}`)}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted">{t('sidebar.telraamLegend.citizen')}</p>
    </div>
  );
}

/**
 * The reports layer's status colours, with how many of the city's reports of
 * the last days have each (the same query as the map, so no extra request).
 */
export function CitizenReportLegend({ cityId }: { cityId: string }) {
  const { t } = useTranslation();
  const { data } = useCitizenReports(cityId);
  const reports = data?.data;
  return (
    <div className="ps-9 pe-2 py-1">
      <ul aria-label={t('sidebar.reports.legend')} className="space-y-0.5">
        {(Object.keys(REPORT_STATUS_COLORS) as CitizenReportStatus[]).map((status) => (
          <li key={status} className="flex items-center gap-2 text-[12px] text-muted">
            <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border border-gray-400/60 shrink-0" style={{ backgroundColor: REPORT_STATUS_COLORS[status] }} />
            <span>{t(`mapPopup.reports.status.${status}`)}</span>
            {reports && <span className="ms-auto tabular-nums">{reports.counts[status]}</span>}
          </li>
        ))}
      </ul>
      {reports && (
        <p className="mt-1 text-[11px] text-muted">{t('sidebar.reports.window', { days: reports.windowDays })}</p>
      )}
    </div>
  );
}

/**
 * The year shown and what the accident circles' colours mean, with how many
 * accidents of each severity the current filter keeps. Shares the map's query,
 * so it fetches nothing of its own.
 */
export function AccidentLegend({ cityId, filter }: { cityId: string; filter: AccidentFilter }) {
  const { t, i18n } = useTranslation();
  const { data } = useTrafficAccidents(cityId, true);
  const accidents = data?.data;
  const counts = useMemo(() => (accidents ? countBySeverity(accidents.accidents, filter) : null), [accidents, filter]);
  const format = (n: number) => n.toLocaleString(i18n.language);
  return (
    <div className="ps-9 pe-2 py-1">
      {accidents && <p className="text-[12px] text-muted mb-0.5">{t('sidebar.accidentLegend.year', { year: accidents.year })}</p>}
      <ul aria-label={t('sidebar.accidentLegend.title', { year: accidents?.year ?? '' })} className="space-y-0.5">
        {ACCIDENT_SEVERITY.map(({ severity, key, color }) => (
          <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
            <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border border-gray-400/60 shrink-0" style={{ backgroundColor: color }} />
            <span>{t(`sidebar.accidentLegend.${key}`)}</span>
            {counts && <span className="ms-auto tabular-nums">{format(counts[severity])}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A layer's sub-layer buttons for the ones the city has, or nothing when it
 * has one or none: a lone sub-layer is the layer itself. `minItems` is 1 where
 * another button sits beside the list (noise's live sensors).
 */
function SubLayerList<K extends string>({ meta, available, isActive, onSelect, label, parentColor, minItems = 2 }: {
  meta: ReadonlyArray<{ key: K; icon: IconNode; color: string }>;
  available: readonly K[];
  isActive: (key: K) => boolean;
  onSelect: (key: K) => void;
  label: (key: K) => string;
  parentColor: string;
  minItems?: number;
}) {
  if (available.length < minItems) return null;
  return (
    <>
      {meta.filter(({ key }) => available.includes(key)).map(({ key, icon, color }) => (
        <SubLayerItem
          key={key}
          icon={icon}
          color={color}
          active={isActive(key)}
          label={label(key)}
          onClick={() => onSelect(key)}
          parentColor={parentColor}
        />
      ))}
    </>
  );
}

export function DataLayerToggles() {
  const { t } = useTranslation();
  const city = useCityConfig();
  const singleView = useCommandCenter((s) => s.singleView);
  const toggleSingleView = useCommandCenter((s) => s.toggleSingleView);
  const activeLayers = useCommandCenter((s) => s.activeLayers);
  const toggleLayer = useCommandCenter((s) => s.toggleLayer);
  const newsSubLayers = useCommandCenter((s) => s.newsSubLayers);
  const toggleNewsSubLayer = useCommandCenter((s) => s.toggleNewsSubLayer);
  const politicalLayer = useCommandCenter((s) => s.politicalLayer);
  const setPoliticalLayer = useCommandCenter((s) => s.setPoliticalLayer);
  const emergencySubLayers = useCommandCenter((s) => s.emergencySubLayers);
  const toggleEmergencySubLayer = useCommandCenter((s) => s.toggleEmergencySubLayer);
  const waterSubLayers = useCommandCenter((s) => s.waterSubLayers);
  const toggleWaterSubLayer = useCommandCenter((s) => s.toggleWaterSubLayer);
  const trafficSubLayers = useCommandCenter((s) => s.trafficSubLayers);
  const toggleTrafficSubLayer = useCommandCenter((s) => s.toggleTrafficSubLayer);
  const noiseLayer = useCommandCenter((s) => s.noiseLayer);
  const setNoiseLayer = useCommandCenter((s) => s.setNoiseLayer);
  const noiseLiveData = useCommandCenter((s) => s.noiseLiveData);
  const toggleNoiseLiveData = useCommandCenter((s) => s.toggleNoiseLiveData);
  const socialLayer = useCommandCenter((s) => s.socialLayer);
  const setSocialLayer = useCommandCenter((s) => s.setSocialLayer);
  const populationLayer = useCommandCenter((s) => s.populationLayer);
  const setPopulationLayer = useCommandCenter((s) => s.setPopulationLayer);
  const accidentFilter = useCommandCenter((s) => s.accidentFilter);
  const setAccidentFilter = useCommandCenter((s) => s.setAccidentFilter);
  // With the single-key shortcuts switched off, the number badges would point to keys that do nothing.
  const shortcutsOn = useShortcutSettings((s) => s.enabled);
  const setHintsOpen = useShortcutSettings((s) => s.setHintsOpen);
  const available = useMemo(() => cityLayers(city), [city]);
  const news = effectiveSubLayers(newsSubLayers, available.news);
  const emergencies = effectiveSubLayers(emergencySubLayers, available.emergencies);
  const traffic = effectiveSubLayers(trafficSubLayers, available.traffic);
  const water = effectiveSubLayers(waterSubLayers, available.water);
  const noise = effectiveNoiseLayer(noiseLayer, available);
  const social = effectiveChoice(socialLayer, available.social);
  const political = effectiveChoice(politicalLayer, available.political);
  // Each city names its social-atlas indicators its own way, with the edition
  // they come from and, for a coarse source, its areas.
  const socialAtlas = socialAtlasOf(city.id);
  const socialLabel = (key: SocialLayer) => {
    const indicator = indicatorOf(socialAtlas, key);
    if (!indicator) return t(`sidebar.social.${key}`);
    const note = socialAtlas!.areas ? `${socialAtlas!.edition}, ${t(`socialAtlas.areas.${socialAtlas!.areas}`)}` : socialAtlas!.edition;
    return `${t(`socialAtlas.indicator.${indicator.label}`)} (${note})`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {/* Opens the Keyboard Shortcuts dialog, where the shortcuts can be switched
            off; the ? key that also opens it is one of them. py-1 -my-1: 24px tall. */}
        <button
          type="button"
          onClick={() => setHintsOpen(true)}
          aria-haspopup="dialog"
          className="hidden sm:inline py-1 -my-1 text-[11px] text-muted hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors"
        >
          {t('shortcuts.title')}
        </button>
        {/* py-1 -my-1 pads the tap target to 24px tall (WCAG 2.5.8) without moving the row. */}
        <button
          onClick={toggleSingleView}
          aria-pressed={singleView}
          className="flex items-center gap-1.5 py-1 -my-1 text-[11px] text-muted hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors"
        >
          <span className={singleView ? 'text-gray-700 dark:text-gray-200 font-medium' : ''}>
            {t('sidebar.viewMode.single')}
          </span>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className={!singleView ? 'text-gray-700 dark:text-gray-200 font-medium' : ''}>
            {t('sidebar.viewMode.multi')}
          </span>
        </button>
      </div>
      <div className="space-y-0.5">
        {LAYER_META.filter(({ layer }) => available.layers.has(layer)).map(({ layer, icon, color }) => {
          const active = activeLayers.has(layer);

          let subItems: ReactNode = null;
          if (layer === 'news' && active) {
            subItems = (
              <SubLayerList meta={NEWS_SUB_META} available={available.news} parentColor={color}
                isActive={(key) => news.has(key)} onSelect={toggleNewsSubLayer} label={(key) => t(`sidebar.news.${key}`)} />
            );
          } else if (layer === 'traffic' && active) {
            subItems = (
              <>
                <SubLayerList meta={TRAFFIC_SUB_META} available={available.traffic} parentColor={color}
                  isActive={(key) => traffic.has(key)} onSelect={toggleTrafficSubLayer} label={(key) => t(`sidebar.traffic.${key}`)} />
                {traffic.has('telraam') && <TelraamLegend cityId={city.id} />}
              </>
            );
          } else if (layer === 'bike-sharing' && active) {
            subItems = <BikeSharingLegend />;
          } else if (layer === 'accidents' && active) {
            subItems = (
              <>
                <SubLayerList meta={ACCIDENT_FILTER_META} available={ACCIDENT_FILTER_META.map((m) => m.key)} parentColor={color}
                  isActive={(key) => accidentFilter === key} onSelect={setAccidentFilter} label={(key) => t(`sidebar.accidents.${key}`)} />
                <AccidentLegend cityId={city.id} filter={accidentFilter} />
              </>
            );
          } else if (layer === 'emergencies' && active) {
            subItems = (
              <SubLayerList meta={EMERGENCY_SUB_META} available={available.emergencies} parentColor={color}
                isActive={(key) => emergencies.has(key)} onSelect={toggleEmergencySubLayer} label={(key) => t(`sidebar.emergencies.${key}`)} />
            );
          } else if (layer === 'water' && active) {
            subItems = (
              <SubLayerList meta={WATER_SUB_META} available={available.water} parentColor={color}
                isActive={(key) => water.has(key)} onSelect={toggleWaterSubLayer} label={(key) => t(`sidebar.water.${key}`)} />
            );
          } else if (layer === 'noise' && active) {
            // Without live sensors the last noise map can't be switched off: nothing would be visible.
            const liveItem = available.noiseLive && (available.noise.length > 0) ? (
              <SubLayerItem
                key="live"
                icon={Activity as IconNode}
                color="#10b981"
                active={noiseLiveData}
                label={t('sidebar.noise.live')}
                onClick={toggleNoiseLiveData}
                parentColor={color}
              />
            ) : null;
            subItems = (
              <>
                {liveItem}
                <SubLayerList meta={NOISE_SUB_META} available={available.noise} parentColor={color}
                  minItems={liveItem ? 1 : 2}
                  isActive={(key) => noise === key}
                  onSelect={(key) => { if (available.noiseLive || noise !== key) setNoiseLayer(key); }}
                  label={(key) => t(`sidebar.noise.${key}`)} />
                {noise !== null && getNoiseWmsMinZoom(city.id) !== undefined && (
                  <p className="ps-9 pe-2 py-1 text-[12px] text-muted">{t('sidebar.noise.zoomIn')}</p>
                )}
              </>
            );
          } else if (layer === 'social' && active) {
            subItems = (
              <>
                <SubLayerList meta={SOCIAL_SUB_META} available={available.social} parentColor={color}
                  isActive={(key) => social === key} onSelect={setSocialLayer} label={socialLabel} />
                {social === 'rent' && <RentMapLegend cityId={city.id} />}
              </>
            );
          } else if (layer === 'population' && active) {
            subItems = (
              <SubLayerList meta={POPULATION_SUB_META} available={POPULATION_SUB_META.map((m) => m.key)} parentColor={color}
                isActive={(key) => populationLayer === key} onSelect={setPopulationLayer} label={(key) => t(`sidebar.population.${key}`)} />
            );
          } else if (layer === 'reports' && active) {
            subItems = <CitizenReportLegend cityId={city.id} />;
          } else if (layer === 'political' && active) {
            // The state parliament has its own name per city (the `_<city id>` keys).
            subItems = (
              <SubLayerList meta={POLITICAL_SUB_META} available={available.political} parentColor={color}
                isActive={(key) => political === key} onSelect={setPoliticalLayer}
                label={(key) => t(`sidebar.political.${key}`, { context: city.id })} />
            );
          }

          const shortcut = shortcutsOn ? LAYER_SHORTCUT[layer] : undefined;
          return (
            <div key={layer}>
              <button
                type="button"
                onClick={() => toggleLayer(layer)}
                aria-pressed={active}
                aria-keyshortcuts={shortcut != null ? String(shortcut) : undefined}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-start ${
                  active ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                style={active ? { backgroundColor: `${color}18` } : undefined}
              >
                <span className="relative">
                  <LayerBadge icon={icon} color={color} active={active} />
                  {/* Shown, but not read out as part of the name: aria-keyshortcuts says it. */}
                  {shortcut != null && (
                    <span aria-hidden="true" className="hidden sm:flex absolute -top-1.5 -inset-e-1.5 w-4 h-4 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-[9px] font-bold text-muted leading-none">
                      {shortcut}
                    </span>
                  )}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t(`sidebar.layers.${layer}`)}
                </span>
              </button>
              {subItems}
            </div>
          );
        })}
      </div>
    </div>
  );
}
