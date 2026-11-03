import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DwdHeatTrend, WeatherAlert } from '@city-monitor/shared';
import { useCityConfig } from '../hooks/useCityConfig.js';
import { useCommandCenter } from '../hooks/useCommandCenter.js';
import { useWarningsInForce } from '../hooks/useWarningsInForce.js';
import { cityLayers } from '../lib/map-layers.js';
import { cityDate } from '../lib/city-time.js';
import { heatSignal } from '../lib/heat-relief.js';

/**
 * Points to the heat-relief map layer while DWD warns of heat or its heat
 * trend expects heat within a few days (`heatSignal`), naming what the city's
 * layer has. The button turns the layer on and scrolls up to the map. Nothing
 * for a city without the layer or without heat.
 */
export function HeatReliefHint({ alerts, trend, className = '' }: { alerts: WeatherAlert[]; trend?: DwdHeatTrend; className?: string }) {
  const { t } = useTranslation();
  const city = useCityConfig();
  const showHeatRelief = useCommandCenter((s) => s.showHeatRelief);
  const kinds = useMemo(() => cityLayers(city).heatRelief, [city]);
  // Re-checked when a heat warning runs out while the page stays open
  const heatInForce = useWarningsInForce(alerts.filter((a) => a.kind === 'heat'));
  // When the tile first drew; heatInForce follows a warning's end on its own
  const [now] = useState(Date.now);

  if (kinds.length === 0) return null;
  const signal = heatSignal(heatInForce, trend, cityDate(new Date(now), city.timezone), now);
  if (!signal) return null;

  const show = () => {
    showHeatRelief();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div role="note" className={`rounded border p-2 bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-800 ${className}`}>
      <p className="font-semibold text-gray-900 dark:text-gray-100">{t(`panel.weather.heatRelief.${signal}`)}</p>
      <p className="mt-0.5 text-gray-700 dark:text-gray-300">
        {t('panel.weather.heatRelief.onMap', { places: kinds.map((k) => t(`sidebar.heatRelief.${k}`)).join(', ') })}
      </p>
      <button
        type="button"
        onClick={show}
        className="mt-1 py-1 -mb-1 font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2 hover:no-underline cursor-pointer"
      >
        {t('panel.weather.heatRelief.show')}
      </button>
    </div>
  );
}
