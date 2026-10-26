import { useTranslation } from 'react-i18next';
import type { DwdUvForecast } from '@city-monitor/shared';
import { useCityConfig } from '../hooks/useCityConfig.js';
import { getUvLevel, uvIndexForToday } from '../lib/uv-levels.js';

/**
 * Today's UV index maximum from the DWD forecast with its risk level, e.g.
 * "UV max 4 ● Moderate", for the conditions row of the weather tile and
 * popover. The label says "max" because the row's other values are current
 * readings. The dot carries the WHO colour; the level is text so it does not
 * depend on colour. Renders nothing when the city has no DWD forecast for today.
 */
export function UvIndexToday({ forecast }: { forecast: DwdUvForecast | undefined }) {
  const { timezone } = useCityConfig();
  const { t } = useTranslation();

  const value = uvIndexForToday(forecast, timezone);
  if (value === null) return null;
  const uv = getUvLevel(value);

  return (
    <span className="inline-flex items-center gap-1" title={t('panel.weather.uvTodayHint')}>
      {t('panel.weather.uvMax')} {Math.round(value)}
      <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: uv.color }} />
      {' '}{t(`panel.weather.uvLevel.${uv.level}`)}
    </span>
  );
}
