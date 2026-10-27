/**
 * WMO Weather interpretation codes (WW) to condition names and icons.
 * Reference: https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM
 */

export interface WeatherInfo {
  /** i18n key of the condition's name ("Overcast", "Heavy rain"). */
  labelKey: string;
  icon: string;
}

/** Icon of each code the table knows; its name is `panel.weather.code.<code>`. */
const WMO_CODES: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌦️',
  56: '🌧️',
  57: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌧️',
  67: '🌧️',
  71: '🌨️',
  73: '🌨️',
  75: '🌨️',
  77: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '🌧️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

const FALLBACK: WeatherInfo = { labelKey: 'panel.weather.code.unknown', icon: '🌡️' };

export function getWeatherInfo(code: number): WeatherInfo {
  const icon = WMO_CODES[code];
  return icon ? { labelKey: `panel.weather.code.${code}`, icon } : FALLBACK;
}
