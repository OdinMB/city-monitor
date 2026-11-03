import { createElement, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrainFront, Wind, Newspaper, TriangleAlert, HeartPulse, Pill, Car, Construction, Landmark, Building2, Building, CloudRain, Droplets, Waves, Home, BarChart3, Siren, Users, UserRound, Globe, Briefcase, Baby, HandCoins, Heart, Volume2, TrainTrack, Plane, Activity, Megaphone, Bike, CarFront, Footprints, Gauge, ThermometerSun, TreeDeciduous, Hospital } from 'lucide';
import { ArrowUpDown, Leaf } from 'lucide';
import { CATEGORY_ORDER, GROUP_CATEGORIES, useCommandCenter, type MapCategory, type AccidentFilter, type DataLayer, type PoliticalLayer, type SocialLayer, type PopulationLayer, type NoiseLayer, type NewsSubLayer, type EmergencySubLayer, type WaterSubLayer, type TrafficSubLayer, type HeatReliefSubLayer } from '../../hooks/useCommandCenter.js';
import { HEAT_RELIEF_KINDS } from '../../lib/heat-relief.js';
import { SquareParking, Thermometer, Vote } from 'lucide';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useShortcutSettings } from '../../hooks/useShortcutSettings.js';
import { categoryDefaults, categoryLayers, effectiveChoice, effectiveNoiseLayer, effectiveSubLayers, withoutEmptyHospitals, type CityLayers } from '../../lib/map-layers.js';
import { useCityLayers, useHospitals } from '../../hooks/useHospitals.js';
import { LIFT_KIND_COLORS } from '../map/constants.js';
import { HOSPITAL_TIER_COLORS, HOSPITAL_TIERS } from '../../lib/hospitals.js';
import { indicatorOf, socialAtlasOf } from '../../lib/social-atlas.js';
import type { IconNode } from '../../lib/map-icons.js';
import { PARKING_OCCUPANCY } from '../map/constants.js';
import { REPORT_STATUS_COLORS } from '../map/layers/citizen-reports.js';
import { useCitizenReports } from '../../hooks/useCitizenReports.js';
import type { CitizenReportStatus } from '../../lib/api.js';
import { useTrafficAccidents } from '../../hooks/useTrafficAccidents.js';
import { countBySeverity } from '../map/layers/traffic-accidents.js';
import {
  ACCIDENT_SEVERITY, BIKE_AVAILABILITY, TRAFFIC_COUNT_LEVELS, TRAFFIC_COUNT_NONE_COLOR, getNoiseWmsMinZoom, getRentMapLegend, getTrafficFlowLegend,
  getTrafficFlowMinZoom,
} from '../map/constants.js';
import { EvCharger, ShieldAlert, HandFist, Wallet, DoorOpen } from 'lucide';
import { CRIME_CLASSES, CRIME_INDICATORS } from '../map/layers/crime-atlas.js';
import { useCrimeAtlas } from '../../hooks/useCrimeAtlas.js';
import type { CrimeLayer } from '../../hooks/useCommandCenter.js';
import { EV_LIVE_STATES, EV_POWER_CLASSES } from '../map/constants.js';
import { useTelraamCounts } from '../../hooks/useTelraamCounts.js';
import { TELRAAM_BIKE_SHARE } from '../map/constants.js';
import { useElectionResults } from '../../hooks/useElectionResults.js';
import { electionTitle, leadersOf } from '../map/layers/elections.js';
import { getPartyColor } from '../../lib/party-colors.js';
import { SourceText } from '../SourceText.js';

// Each city sees only the layers and sub-layers it has data for (cityLayers).
const LAYER_META: Record<DataLayer, { icon: IconNode; color: string }> = {
  warnings: { icon: TriangleAlert as IconNode, color: '#ef4444' },
  news: { icon: Newspaper as IconNode, color: '#6366f1' },
  traffic: { icon: Car as IconNode, color: '#8b5cf6' },
  weather: { icon: CloudRain as IconNode, color: '#0ea5e9' },
  'air-quality': { icon: Wind as IconNode, color: '#50C878' },
  noise: { icon: Volume2 as IconNode, color: '#f97316' },
  water: { icon: Droplets as IconNode, color: '#3b82f6' },
  emergencies: { icon: HeartPulse as IconNode, color: '#ef4444' },
  social: { icon: BarChart3 as IconNode, color: '#8b5cf6' },
  'bike-sharing': { icon: Bike as IconNode, color: '#16a34a' },
  parking: { icon: SquareParking as IconNode, color: '#2563eb' },
  accidents: { icon: CarFront as IconNode, color: '#dc2626' },
  lifts: { icon: ArrowUpDown as IconNode, color: '#dc2626' },
  crime: { icon: ShieldAlert as IconNode, color: '#b91c1c' },
  'ev-charging': { icon: EvCharger as IconNode, color: '#0ea5e9' },
  'heat-relief': { icon: ThermometerSun as IconNode, color: '#f97316' },
  population: { icon: Users as IconNode, color: '#3b82f6' },
  political: { icon: Landmark as IconNode, color: '#64748b' },
  reports: { icon: Megaphone as IconNode, color: '#e11d48' },
  trees: { icon: TreeDeciduous as IconNode, color: '#15803d' },
};

/** The badge of a category: its layer's, or its own for one that groups several. */
const CATEGORY_META: Record<MapCategory, { icon: IconNode; color: string }> = {
  warnings: LAYER_META.warnings,
  news: LAYER_META.news,
  traffic: LAYER_META.traffic,
  weather: LAYER_META.weather,
  environment: { icon: Leaf as IconNode, color: '#16a34a' },
  emergencies: LAYER_META.emergencies,
  social: { icon: Users as IconNode, color: '#8b5cf6' },
  reports: LAYER_META.reports,
};

const INACTIVE_COLOR = '#9ca3af';

/** A traffic entry: one of the traffic layer's own sub-layers, or another layer of the category. */
type TrafficItem = { sub: TrafficSubLayer } | { layer: DataLayer };
/**
 * The traffic category's entries in one list, grouped by theme: public
 * transport, roads, parking and charging, bikes, counters.
 */
const TRAFFIC_ITEMS: readonly TrafficItem[] = [
  { sub: 'public-transport' }, { layer: 'lifts' },
  { sub: 'incidents' }, { sub: 'congestion' }, { sub: 'roadworks' }, { layer: 'accidents' },
  { layer: 'parking' }, { layer: 'ev-charging' },
  { layer: 'bike-sharing' },
  { sub: 'car-counts' }, { sub: 'bike-counts' }, { sub: 'telraam' },
];

const NEWS_SUB_META: { key: NewsSubLayer; icon: IconNode; color: string }[] = [
  { key: 'news', icon: Newspaper as IconNode, color: '#6366f1' },
  { key: 'police', icon: Siren as IconNode, color: '#f97316' },
];

const EMERGENCY_SUB_META: { key: EmergencySubLayer; icon: IconNode; color: string }[] = [
  { key: 'pharmacies', icon: Pill as IconNode, color: '#22c55e' },
  { key: 'aeds', icon: HeartPulse as IconNode, color: '#ef4444' },
  { key: 'hospitals', icon: Hospital as IconNode, color: '#b91c1c' },
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
  { key: 'temperature', icon: Thermometer as IconNode, color: '#0d9488' },
];

const HEAT_RELIEF_SUB_META: { key: HeatReliefSubLayer; icon: IconNode; color: string }[] =
  HEAT_RELIEF_KINDS.map(({ sub, icon, color }) => ({ key: sub, icon, color }));

const TRAFFIC_SUB_META: { key: TrafficSubLayer; icon: IconNode; color: string }[] = [
  { key: 'public-transport', icon: TrainFront as IconNode, color: '#f59e0b' },
  { key: 'incidents', icon: Car as IconNode, color: '#8b5cf6' },
  { key: 'congestion', icon: Gauge as IconNode, color: '#e70104' },
  { key: 'roadworks', icon: Construction as IconNode, color: '#d97706' },
  { key: 'car-counts', icon: CarFront as IconNode, color: '#64748b' },
  { key: 'bike-counts', icon: Bike as IconNode, color: '#16a34a' },
  { key: 'telraam', icon: Activity as IconNode, color: '#16a34a' },
];

const ACCIDENT_FILTER_META: { key: AccidentFilter; icon: IconNode; color: string }[] = [
  { key: 'all', icon: CarFront as IconNode, color: '#dc2626' },
  { key: 'bike', icon: Bike as IconNode, color: '#dc2626' },
  { key: 'pedestrian', icon: Footprints as IconNode, color: '#dc2626' },
];

const CRIME_ICONS: Record<CrimeLayer, IconNode> = {
  total: ShieldAlert as IconNode,
  assault: HandFist as IconNode,
  robbery: Wallet as IconNode,
  burglary: DoorOpen as IconNode,
  bikeTheft: Bike as IconNode,
  kiez: Siren as IconNode,
};
const CRIME_SUB_META: { key: CrimeLayer; icon: IconNode; color: string }[] =
  CRIME_INDICATORS.map((key) => ({ key, icon: CRIME_ICONS[key], color: '#b91c1c' }));

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
  { key: 'elections', icon: Vote as IconNode, color: '#64748b' },
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

/** What the parking circles' colours mean: the share of a car park's spaces free. */
export function ParkingLegend() {
  const { t } = useTranslation();
  return (
    <ul aria-label={t('sidebar.parkingLegend.title')} className="ps-9 pe-2 py-1 space-y-0.5">
      {PARKING_OCCUPANCY.map(({ key, color }) => (
        <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border border-gray-400/60 shrink-0" style={{ backgroundColor: color }} />
          {t(`sidebar.parkingLegend.${key}`)}
        </li>
      ))}
    </ul>
  );
}

/** What the lift-outage circles' colours mean, and that only units with a position are drawn. */
export function LiftLegend() {
  const { t } = useTranslation();
  return (
    <DotLegend
      title={t('sidebar.liftLegend.title')}
      items={(['lift', 'escalator'] as const).map((key) => ({ key, color: LIFT_KIND_COLORS[key], label: t(`sidebar.liftLegend.${key}`) }))}
    />
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

/** A legend of coloured dots: a list of `label` keys with their colours. */
function DotLegend({ title, items }: { title: string; items: ReadonlyArray<{ key: string; label: string; color: string }> }) {
  return (
    <ul aria-label={title} className="ps-9 pe-2 py-1 space-y-0.5">
      {items.map(({ key, label, color }) => (
        <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border border-gray-400/60 shrink-0" style={{ backgroundColor: color }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** The hospitals' marker colours: only the tiers the city's hospitals have (Hamburg's WFS has no G-BA tier). */
export function HospitalLegend({ cityId }: { cityId: string }) {
  const { t } = useTranslation();
  const { data } = useHospitals(cityId);
  const present = new Set(data?.hospitals.map((h) => h.tier) ?? []);
  const items = HOSPITAL_TIERS.filter((tier) => present.has(tier))
    .map((tier) => ({ key: tier, color: HOSPITAL_TIER_COLORS[tier], label: t(`mapPopup.hospital.tier.${tier}`) }));
  if (items.length === 0) return null;
  return <DotLegend title={t('sidebar.hospitalLegend')} items={items} />;
}

/**
 * The emergencies layer's sub-layers. Hospitals are listed only once the
 * server has some for the city: Berlin, Köln and München have only the
 * Klinik-Atlas, which the server leaves out with KLINIK_ATLAS=false.
 */
function EmergencySubLayers({ cityId, layers, parentColor, selected, onSelect }: {
  cityId: string;
  layers: CityLayers;
  parentColor: string;
  selected: ReadonlySet<EmergencySubLayer>;
  onSelect: (key: EmergencySubLayer) => void;
}) {
  const { t } = useTranslation();
  const { data } = useHospitals(cityId, layers.emergencies.includes('hospitals'));
  const available = withoutEmptyHospitals(layers, (data?.hospitals.length ?? 0) > 0).emergencies;
  const active = effectiveSubLayers(selected, available);
  return (
    <>
      <SubLayerList meta={EMERGENCY_SUB_META} available={available} parentColor={parentColor}
        isActive={(key) => active.has(key)} onSelect={onSelect} label={(key) => t(`sidebar.emergencies.${key}`)} />
      {active.has('hospitals') && <HospitalLegend cityId={cityId} />}
    </>
  );
}

/** The classes of the city's live congestion map with the colours its WMS draws them in. */
export function TrafficFlowLegend({ cityId }: { cityId: string }) {
  const { t } = useTranslation();
  const legend = getTrafficFlowLegend(cityId);
  if (legend.length === 0) return null;
  return (
    <DotLegend
      title={t('sidebar.trafficFlowLegend.title')}
      items={legend.map(({ key, color }) => ({ key, color, label: t(`sidebar.trafficFlowLegend.${key}`) }))}
    />
  );
}

/** What the counting sites' colours mean: the hour's count against the usual count. */
export function TrafficCountLegend() {
  const { t } = useTranslation();
  const items = [
    ...TRAFFIC_COUNT_LEVELS.map(({ key, color }) => ({ key, color })),
    { key: 'none', color: TRAFFIC_COUNT_NONE_COLOR },
  ].map(({ key, color }) => ({ key, color, label: t(`sidebar.trafficCountLegend.${key}`) }));
  return <DotLegend title={t('sidebar.trafficCountLegend.title')} items={items} />;
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
 * The reports layer's statuses as switches, in their map colours, with how
 * many of the city's reports of the last days have each (the same query as
 * the map, so no extra request). Closed ones start switched off; the last
 * status shown can't be switched off.
 */
export function CitizenReportLegend({ cityId }: { cityId: string }) {
  const { t } = useTranslation();
  const { data } = useCitizenReports(cityId);
  const selected = useCommandCenter((s) => s.reportStatuses);
  const toggle = useCommandCenter((s) => s.toggleReportStatus);
  const reports = data?.data;
  return (
    <div className="ps-7 pe-2 py-1">
      <ul aria-label={t('sidebar.reports.legend')}>
        {(Object.keys(REPORT_STATUS_COLORS) as CitizenReportStatus[]).map((status) => {
          const on = selected.has(status);
          const color = REPORT_STATUS_COLORS[status];
          return (
            <li key={status}>
              {/* py-1: a 24px tap target (WCAG 2.5.8) */}
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(status)}
                className={`flex items-center gap-2 w-full px-2 py-1 rounded text-[12px] text-start cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${on ? 'text-gray-700 dark:text-gray-300' : 'text-muted'}`}
              >
                <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full border-2 shrink-0" style={{ borderColor: color, backgroundColor: on ? color : 'transparent' }} />
                <span>{t(`mapPopup.reports.status.${status}`)}</span>
                {reports && <span className="ms-auto tabular-nums">{reports.counts[status]}</span>}
              </button>
            </li>
          );
        })}
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
 * The crime map's year and what its colours mean: an area's rate of the
 * chosen offence group against the city's, with the city's rate. Shares the
 * map's query, so it fetches nothing of its own.
 */
export function CrimeLegend({ cityId, indicator }: { cityId: string; indicator: CrimeLayer }) {
  const { t, i18n } = useTranslation();
  const { data } = useCrimeAtlas(cityId, true);
  const atlas = data?.data;
  const cityRate = atlas?.city[indicator];
  return (
    <div className="ps-9 pe-2 py-1">
      {atlas && (
        <p className="text-[12px] text-muted mb-0.5">
          {t('sidebar.crimeLegend.year', { year: atlas.year })}
          {typeof cityRate === 'number' && <> · {t('sidebar.crimeLegend.cityRate', { rate: Math.round(cityRate).toLocaleString(i18n.language) })}</>}
        </p>
      )}
      <ul aria-label={t('sidebar.crimeLegend.title')} className="space-y-0.5">
        {CRIME_CLASSES.map(({ key, color }) => (
          <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
            <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm border border-gray-400/60 shrink-0" style={{ backgroundColor: color }} />
            {t(`sidebar.crimeLegend.${key}`)}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted">{t('sidebar.crimeLegend.note')}</p>
    </div>
  );
}

/**
 * What the charging circles mean: their colour the power class, and in a city
 * with a live feed (`live`) their ring the charge points' status.
 */
export function EvChargingLegend({ live }: { live: boolean }) {
  const { t } = useTranslation();
  const swatch = 'inline-block w-2.5 h-2.5 rounded-full shrink-0';
  return (
    <div className="ps-9 pe-2 py-1 space-y-1">
      <ul aria-label={t('sidebar.evLegend.title')} className="space-y-0.5">
        {EV_POWER_CLASSES.map(({ key, color }) => (
          <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
            <span aria-hidden="true" className={`${swatch} border border-gray-400/60`} style={{ backgroundColor: color }} />
            {t(`sidebar.evLegend.${key}`)}
          </li>
        ))}
      </ul>
      {live && (
        <ul aria-label={t('sidebar.evLegend.liveTitle')} className="space-y-0.5">
          {EV_LIVE_STATES.map(({ key, color }) => (
            <li key={key} className="flex items-center gap-2 text-[12px] text-muted">
              <span aria-hidden="true" className={`${swatch} border-2 bg-transparent`} style={{ borderColor: color }} />
              {t(`sidebar.evLegend.${key}`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The election view's key: which election, and each party that is strongest
 * somewhere, in its map colour, with the number of areas it leads. Shares the
 * map's query.
 */
export function ElectionLegend({ cityId }: { cityId: string }) {
  const { t, i18n } = useTranslation();
  const { data } = useElectionResults(cityId, true);
  const results = data?.data;
  const leaders = useMemo(() => (results ? leadersOf(results) : []), [results]);
  if (!results) return null;
  return (
    <div className="ps-9 pe-2 py-1">
      <p className="text-[12px] text-muted mb-0.5">{electionTitle(results)}</p>
      <ul aria-label={t('sidebar.electionLegend.strongest', { context: results.areaLevel })} className="space-y-0.5">
        <li className="text-[11px] text-muted">{t('sidebar.electionLegend.strongest', { context: results.areaLevel })}</li>
        {leaders.map(([party, count]) => (
          <li key={party} className="flex items-center gap-2 text-[12px] text-muted">
            <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm border border-gray-400/60 shrink-0" style={{ backgroundColor: getPartyColor(party) }} />
            <SourceText as="span">{party}</SourceText>
            <span className="ms-auto tabular-nums">{count.toLocaleString(i18n.language)}</span>
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
  const heatReliefSubLayers = useCommandCenter((s) => s.heatReliefSubLayers);
  const toggleHeatReliefSubLayer = useCommandCenter((s) => s.toggleHeatReliefSubLayer);
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
  const crimeLayer = useCommandCenter((s) => s.crimeLayer);
  const setCrimeLayer = useCommandCenter((s) => s.setCrimeLayer);
  // With the single-key shortcuts switched off, the number badges would point to keys that do nothing.
  const shortcutsOn = useShortcutSettings((s) => s.enabled);
  const setHintsOpen = useShortcutSettings((s) => s.setHintsOpen);
  const toggleCategory = useCommandCenter((s) => s.toggleCategory);
  // Less hospitals and lifts while the server has none for the city
  const available = useCityLayers(city);
  const news =effectiveSubLayers(newsSubLayers, available.news);
  const traffic = effectiveSubLayers(trafficSubLayers, available.traffic);
  const water = effectiveSubLayers(waterSubLayers, available.water);
  const heatRelief = effectiveSubLayers(heatReliefSubLayers, available.heatRelief);
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
        {CATEGORY_ORDER.map((category, index) => {
          const members = categoryLayers(category, available.layers);
          if (members.length === 0) return null;
          const { icon, color } = CATEGORY_META[category];
          const isGroup = GROUP_CATEGORIES.has(category);
          const active = members.some((l) => activeLayers.has(l));
          const content = !active ? null : isGroup ? groupItems(category, members, color) : layerOptions(members[0], color);
          const shortcut = shortcutsOn && index < 9 ? index + 1 : undefined;
          return (
            <div key={category}>
              <button
                type="button"
                onClick={() => toggleCategory(category, categoryDefaults(category, available.layers))}
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
                  {isGroup ? t(`sidebar.categories.${category}`) : t(`sidebar.layers.${members[0]}`)}
                </span>
              </button>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );

  /**
   * A category's layers, each a switch with its own options below it once on.
   * Traffic lists its own sub-layers in the same list (TRAFFIC_ITEMS). The
   * last entry on can't be switched off here: the category's button does that.
   */
  function groupItems(category: MapCategory, members: readonly DataLayer[], parentColor: string): ReactNode {
    const trafficOn = activeLayers.has('traffic');
    // Traffic counts each of its sub-layers shown as an entry of its own
    const activeCount = members.filter((l) => activeLayers.has(l) && l !== 'traffic').length
      + (category === 'traffic' && trafficOn ? traffic.size : 0);
    const nested = (node: ReactNode) => (node ? <div className="ps-6">{node}</div> : null);
    const layerItem = (layer: DataLayer) => {
      const on = activeLayers.has(layer);
      return (
        <div key={layer}>
          <SubLayerItem icon={LAYER_META[layer].icon} color={LAYER_META[layer].color} active={on} label={t(`sidebar.layers.${layer}`)}
            parentColor={parentColor} onClick={() => { if (!on || activeCount > 1) toggleLayer(layer); }} />
          {on && nested(layerOptions(layer, LAYER_META[layer].color))}
        </div>
      );
    };
    if (category !== 'traffic') return <>{members.map(layerItem)}</>;

    const countSubs = available.traffic.filter((s) => s === 'car-counts' || s === 'bike-counts');
    const showsCounts = trafficOn && (traffic.has('car-counts') || traffic.has('bike-counts'));
    return (
      <>
        {TRAFFIC_ITEMS.map((item) => {
          if ('layer' in item) return members.includes(item.layer) ? layerItem(item.layer) : null;
          const { sub } = item;
          if (!available.traffic.includes(sub)) return null;
          const on = trafficOn && traffic.has(sub);
          const meta = TRAFFIC_SUB_META.find((m) => m.key === sub)!;
          return (
            <div key={sub}>
              <SubLayerItem icon={meta.icon} color={meta.color} active={on} label={t(`sidebar.traffic.${sub}`)}
                parentColor={parentColor} onClick={() => { if (!on || activeCount > 1) toggleTrafficSubLayer(sub); }} />
              {on && sub === 'congestion' && nested(
                <>
                  <TrafficFlowLegend cityId={city.id} />
                  {getTrafficFlowMinZoom(city.id) !== undefined && (
                    <p className="ps-9 pe-2 py-1 text-[12px] text-muted">{t('sidebar.traffic.zoomIn')}</p>
                  )}
                </>,
              )}
              {showsCounts && sub === countSubs.at(-1) && nested(<TrafficCountLegend />)}
              {on && sub === 'telraam' && nested(<TelraamLegend cityId={city.id} />)}
            </div>
          );
        })}
      </>
    );
  }

  /** What a switched-on layer shows below its switch: its sub-layers, choices, legend or hints. */
  function layerOptions(layer: DataLayer, color: string): ReactNode {
    let subItems: ReactNode = null;
    if (layer === 'news') {
            subItems = (
              <SubLayerList meta={NEWS_SUB_META} available={available.news} parentColor={color}
                isActive={(key) => news.has(key)} onSelect={toggleNewsSubLayer} label={(key) => t(`sidebar.news.${key}`)} />
            );
          } else if (layer === 'lifts') {
            subItems = <LiftLegend />;
          } else if (layer === 'bike-sharing') {
            subItems = <BikeSharingLegend />;
          } else if (layer === 'parking') {
            subItems = <ParkingLegend />;
          } else if (layer === 'accidents') {
            subItems = (
              <>
                <SubLayerList meta={ACCIDENT_FILTER_META} available={ACCIDENT_FILTER_META.map((m) => m.key)} parentColor={color}
                  isActive={(key) => accidentFilter === key} onSelect={setAccidentFilter} label={(key) => t(`sidebar.accidents.${key}`)} />
                <AccidentLegend cityId={city.id} filter={accidentFilter} />
              </>
            );
          } else if (layer === 'crime') {
            subItems = (
              <>
                <SubLayerList meta={CRIME_SUB_META} available={CRIME_INDICATORS} parentColor={color}
                  isActive={(key) => crimeLayer === key} onSelect={setCrimeLayer} label={(key) => t(`sidebar.crime.${key}`)} />
                <CrimeLegend cityId={city.id} indicator={crimeLayer} />
              </>
            );
          } else if (layer === 'ev-charging') {
            subItems = <EvChargingLegend live={city.features.includes('evChargingLive')} />;
          } else if (layer === 'heat-relief') {
            subItems = (
              <SubLayerList meta={HEAT_RELIEF_SUB_META} available={available.heatRelief} parentColor={color}
                isActive={(key) => heatRelief.has(key)} onSelect={toggleHeatReliefSubLayer} label={(key) => t(`sidebar.heatRelief.${key}`)} />
            );
          } else if (layer === 'emergencies') {
            subItems = (
              <EmergencySubLayers cityId={city.id} layers={available} parentColor={color} selected={emergencySubLayers} onSelect={toggleEmergencySubLayer} />
            );
          } else if (layer === 'water') {
            subItems = (
              <SubLayerList meta={WATER_SUB_META} available={available.water} parentColor={color}
                isActive={(key) => water.has(key)} onSelect={toggleWaterSubLayer} label={(key) => t(`sidebar.water.${key}`)} />
            );
          } else if (layer === 'noise') {
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
          } else if (layer === 'social') {
            subItems = (
              <>
                <SubLayerList meta={SOCIAL_SUB_META} available={available.social} parentColor={color}
                  isActive={(key) => social === key} onSelect={setSocialLayer} label={socialLabel} />
                {social === 'rent' && <RentMapLegend cityId={city.id} />}
              </>
            );
          } else if (layer === 'population') {
            subItems = (
              <SubLayerList meta={POPULATION_SUB_META} available={POPULATION_SUB_META.map((m) => m.key)} parentColor={color}
                isActive={(key) => populationLayer === key} onSelect={setPopulationLayer} label={(key) => t(`sidebar.population.${key}`)} />
            );
          } else if (layer === 'reports') {
            subItems = <CitizenReportLegend cityId={city.id} />;
          } else if (layer === 'trees') {
            // The registers draw from street zoom only (STREET_TREES_MIN_ZOOM)
            subItems = (
              <div className="ps-9 pe-2 py-1 space-y-0.5 text-[12px] text-muted">
                <p>{t('sidebar.trees.zoomIn')}</p>
                <p>{t('sidebar.trees.hint')}</p>
              </div>
            );
          } else if (layer === 'political') {
            // The state parliament has its own name per city (the `_<city id>` keys).
            subItems = (
              <>
                <SubLayerList meta={POLITICAL_SUB_META} available={available.political} parentColor={color}
                  isActive={(key) => political === key} onSelect={setPoliticalLayer}
                  label={(key) => t(`sidebar.political.${key}`, { context: city.id })} />
                {political === 'elections' && <ElectionLegend cityId={city.id} />}
              </>
            );
          }

    return subItems;
  }
}
