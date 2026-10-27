import { createElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrainFront, Wind, Newspaper, TriangleAlert, HeartPulse, Pill, Car, Construction, Landmark, Building2, Building, CloudRain, Droplets, Waves, Home, BarChart3, Siren, Users, UserRound, Globe, Briefcase, Baby, HandCoins, Heart, Volume2, TrainTrack, Plane, Activity } from 'lucide';
import { useCommandCenter, type DataLayer, type PoliticalLayer, type SocialLayer, type PopulationLayer, type NoiseLayer, type NoiseWmsLayer, type NewsSubLayer, type EmergencySubLayer, type WaterSubLayer, type TrafficSubLayer } from '../../hooks/useCommandCenter.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useShortcutSettings } from '../../hooks/useShortcutSettings.js';
import type { IconNode } from '../../lib/map-icons.js';

const LAYER_META: { layer: DataLayer; icon: IconNode; color: string; cities?: string[] }[] = [
  { layer: 'warnings', icon: TriangleAlert as IconNode, color: '#ef4444' },
  { layer: 'news', icon: Newspaper as IconNode, color: '#6366f1' },
  { layer: 'traffic', icon: Car as IconNode, color: '#8b5cf6' },
  { layer: 'weather', icon: CloudRain as IconNode, color: '#0ea5e9' },
  { layer: 'air-quality', icon: Wind as IconNode, color: '#50C878' },
  { layer: 'noise', icon: Volume2 as IconNode, color: '#f97316' },
  { layer: 'water', icon: Droplets as IconNode, color: '#3b82f6' },
  { layer: 'emergencies', icon: HeartPulse as IconNode, color: '#ef4444' },
  { layer: 'social', icon: BarChart3 as IconNode, color: '#8b5cf6', cities: ['berlin'] },
  { layer: 'population', icon: Users as IconNode, color: '#3b82f6', cities: ['berlin'] },
  { layer: 'political', icon: Landmark as IconNode, color: '#64748b' },
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

const NOISE_SUB_META: { key: NoiseLayer; icon: IconNode; color: string; cities?: string[] }[] = [
  { key: 'total', icon: Volume2 as IconNode, color: '#f97316', cities: ['berlin'] },
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
];

const SOCIAL_SUB_META: { key: SocialLayer; icon: IconNode; color: string }[] = [
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
  // With the single-key shortcuts switched off, the number badges would point to keys that do nothing.
  const shortcutsOn = useShortcutSettings((s) => s.enabled);
  const setHintsOpen = useShortcutSettings((s) => s.setHintsOpen);

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
        {LAYER_META.filter(({ cities }) => !cities || cities.includes(city.id)).map(({ layer, icon, color }) => {
          const active = activeLayers.has(layer);

          let subItems: ReactNode = null;
          if (layer === 'news' && active) {
            subItems = NEWS_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={newsSubLayers.has(key)}
                label={t(`sidebar.news.${key}`)}
                onClick={() => toggleNewsSubLayer(key)}
                parentColor={color}
              />
            ));
          } else if (layer === 'traffic' && active) {
            subItems = TRAFFIC_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={trafficSubLayers.has(key)}
                label={t(`sidebar.traffic.${key}`)}
                onClick={() => toggleTrafficSubLayer(key)}
                parentColor={color}
              />
            ));
          } else if (layer === 'emergencies' && active) {
            subItems = EMERGENCY_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={emergencySubLayers.has(key)}
                label={t(`sidebar.emergencies.${key}`)}
                onClick={() => toggleEmergencySubLayer(key)}
                parentColor={color}
              />
            ));
          } else if (layer === 'water' && active) {
            subItems = WATER_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={waterSubLayers.has(key)}
                label={t(`sidebar.water.${key}`)}
                onClick={() => toggleWaterSubLayer(key)}
                parentColor={color}
              />
            ));
          } else if (layer === 'noise' && active) {
            // Hamburg has no 'total' sub-layer — fall back to 'road' for active state highlight
            const effectiveNoise: NoiseWmsLayer = (noiseLayer === 'total' && city.id !== 'berlin') ? 'road' : noiseLayer;
            // Cities without live sensors can't deselect the last WMS map (nothing would be visible)
            const hasLiveSensors = city.id === 'berlin';
            const liveItem = hasLiveSensors ? (
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
            const wmsItems = NOISE_SUB_META
              .filter(({ cities: c }) => !c || c.includes(city.id))
              .map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={effectiveNoise === key}
                label={t(`sidebar.noise.${key}`)}
                onClick={() => { if (hasLiveSensors || effectiveNoise !== key) setNoiseLayer(key); }}
                parentColor={color}
              />
            ));
            subItems = <>{liveItem}{wmsItems}</>;
          } else if (layer === 'social' && active) {
            subItems = SOCIAL_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={socialLayer === key}
                label={t(`sidebar.social.${key}`)}
                onClick={() => setSocialLayer(key)}
                parentColor={color}
              />
            ));
          } else if (layer === 'population' && active) {
            subItems = POPULATION_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={populationLayer === key}
                label={t(`sidebar.population.${key}`)}
                onClick={() => setPopulationLayer(key)}
                parentColor={color}
              />
            ));
          } else if (layer === 'political' && active) {
            subItems = POLITICAL_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={politicalLayer === key}
                label={t(`sidebar.political.${key}`)}
                onClick={() => setPoliticalLayer(key)}
                parentColor={color}
              />
            ));
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
