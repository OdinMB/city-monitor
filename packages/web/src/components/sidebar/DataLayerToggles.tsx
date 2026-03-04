import { createElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrainFront, Wind, Newspaper, TriangleAlert, HeartPulse, Pill, Car, Construction, Landmark, Building2, Building, CloudRain, Droplets, Waves, Home, BarChart3, Siren, Users, UserRound, Globe, Briefcase, Baby, HandCoins, Heart, Volume2, TrainTrack, Plane } from 'lucide';
import { useCommandCenter, type DataLayer, type PoliticalLayer, type SocialLayer, type PopulationLayer, type NoiseLayer, type NewsSubLayer, type EmergencySubLayer, type WaterSubLayer, type TrafficSubLayer } from '../../hooks/useCommandCenter.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
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

function SubLayerItem({ icon, color, active, label, onClick }: { icon: IconNode; color: string; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full pl-8 pr-2 py-1 rounded-lg cursor-pointer transition-colors text-left ${
        active ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      style={active ? { backgroundColor: `${color}12` } : undefined}
    >
      <LayerBadge icon={icon} color={color} active={active} small />
      <span className={`text-[13px] ${active ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
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
  const socialLayer = useCommandCenter((s) => s.socialLayer);
  const setSocialLayer = useCommandCenter((s) => s.setSocialLayer);
  const populationLayer = useCommandCenter((s) => s.populationLayer);
  const setPopulationLayer = useCommandCenter((s) => s.setPopulationLayer);

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={toggleSingleView}
          aria-pressed={singleView}
          className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors"
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
              />
            ));
          } else if (layer === 'noise' && active) {
            // Hamburg has no 'total' sub-layer — fall back to 'road' for active state highlight
            const effectiveNoise = (noiseLayer === 'total' && city.id !== 'berlin') ? 'road' : noiseLayer;
            subItems = NOISE_SUB_META
              .filter(({ cities: c }) => !c || c.includes(city.id))
              .map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={effectiveNoise === key}
                label={t(`sidebar.noise.${key}`)}
                onClick={() => setNoiseLayer(key)}
              />
            ));
          } else if (layer === 'social' && active) {
            subItems = SOCIAL_SUB_META.map(({ key, icon: subIcon, color: subColor }) => (
              <SubLayerItem
                key={key}
                icon={subIcon}
                color={subColor}
                active={socialLayer === key}
                label={t(`sidebar.social.${key}`)}
                onClick={() => setSocialLayer(key)}
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
              />
            ));
          }

          return (
            <div key={layer}>
              <button
                onClick={() => toggleLayer(layer)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-left ${
                  active ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                style={active ? { backgroundColor: `${color}18` } : undefined}
              >
                <LayerBadge icon={icon} color={color} active={active} />
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
