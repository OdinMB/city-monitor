/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrainFront, Wind, Newspaper, ShieldAlert, TriangleAlert, HeartPulse, Pill, Car, Construction, Landmark, Building2, Building, CloudRain, Droplets } from 'lucide';
import { useCommandCenter, type DataLayer, type PoliticalLayer, type EmergencySubLayer } from '../../hooks/useCommandCenter.js';
import type { IconNode } from '../../lib/map-icons.js';

const LAYER_META: { layer: DataLayer; icon: IconNode; color: string }[] = [
  { layer: 'transit', icon: TrainFront as IconNode, color: '#f59e0b' },
  { layer: 'news', icon: Newspaper as IconNode, color: '#6366f1' },
  { layer: 'safety', icon: ShieldAlert as IconNode, color: '#f97316' },
  { layer: 'warnings', icon: TriangleAlert as IconNode, color: '#ef4444' },
  { layer: 'weather', icon: CloudRain as IconNode, color: '#0ea5e9' },
  { layer: 'air-quality', icon: Wind as IconNode, color: '#50C878' },
  { layer: 'emergencies', icon: HeartPulse as IconNode, color: '#ef4444' },
  { layer: 'traffic', icon: Car as IconNode, color: '#8b5cf6' },
  { layer: 'construction', icon: Construction as IconNode, color: '#d97706' },
  { layer: 'water-levels', icon: Droplets as IconNode, color: '#3b82f6' },
  { layer: 'political', icon: Landmark as IconNode, color: '#64748b' },
];

const INACTIVE_COLOR = '#9ca3af';

const EMERGENCY_SUB_META: { key: EmergencySubLayer; icon: IconNode; color: string }[] = [
  { key: 'pharmacies', icon: Pill as IconNode, color: '#22c55e' },
  { key: 'aeds', icon: HeartPulse as IconNode, color: '#ef4444' },
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
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
      <span className={`text-[13px] ${active ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
        {label}
      </span>
    </button>
  );
}

export function DataLayerToggles() {
  const { t } = useTranslation();
  const singleView = useCommandCenter((s) => s.singleView);
  const toggleSingleView = useCommandCenter((s) => s.toggleSingleView);
  const activeLayers = useCommandCenter((s) => s.activeLayers);
  const toggleLayer = useCommandCenter((s) => s.toggleLayer);
  const politicalLayer = useCommandCenter((s) => s.politicalLayer);
  const setPoliticalLayer = useCommandCenter((s) => s.setPoliticalLayer);
  const emergencySubLayers = useCommandCenter((s) => s.emergencySubLayers);
  const toggleEmergencySubLayer = useCommandCenter((s) => s.toggleEmergencySubLayer);

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={toggleSingleView}
          aria-pressed={singleView}
          className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors"
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
        {LAYER_META.map(({ layer, icon, color }) => {
          const active = activeLayers.has(layer);

          let subItems: ReactNode = null;
          if (layer === 'emergencies' && active) {
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
