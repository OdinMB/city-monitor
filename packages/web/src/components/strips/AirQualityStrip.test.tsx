import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { AirQuality, AirQualityGridPoint, AirQualityStation } from '../../lib/api.js';
import { AirQualityStrip } from './AirQualityStrip.js';

const hooks = vi.hoisted(() => ({
  airQuality: {} as { data: unknown; fetchedAt: string | null; isLoading: boolean; isError: boolean; refetch: () => void },
  grid: [] as unknown[],
  stations: undefined as unknown[] | undefined,
  stationsEnabled: [] as boolean[],
}));

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin', timezone: 'Europe/Berlin', features: ['airQualityStations'] }),
}));

vi.mock('../../hooks/useAirQualityStations.js', () => ({
  useAirQualityStations: (_city: string, enabled: boolean) => {
    hooks.stationsEnabled.push(enabled);
    return { data: hooks.stations };
  },
}));

vi.mock('../../hooks/useAirQuality.js', () => ({
  useAirQuality: () => hooks.airQuality,
}));

vi.mock('../../hooks/useAirQualityGrid.js', () => ({
  useAirQualityGrid: () => ({ data: hooks.grid }),
}));

afterEach(async () => {
  cleanup(); // unmount first, so switching back to English re-renders nothing
  await i18n.changeLanguage('en');
});

describe('AirQualityStrip error state', () => {
  beforeEach(() => {
    hooks.airQuality = { data: undefined, fetchedAt: null, isLoading: false, isError: true, refetch: vi.fn() };
    hooks.grid = [];
    hooks.stations = undefined;
  });

  it.each([
    ['en', 'Failed to load Air Quality'],
    ['de', 'Luftqualität: Laden fehlgeschlagen'],
    ['tr', 'Hava Kalitesi yüklenemedi'],
    ['ar', 'جودة الهواء: فشل التحميل'],
  ])('names the tile in the reader\'s language (%s)', async (lang, message) => {
    await i18n.changeLanguage(lang);
    render(<AirQualityStrip expanded={false} />);
    expect(screen.getByText(message)).toBeTruthy();
  });
});

describe('AirQualityStrip station list', () => {
  const AIR_QUALITY: AirQuality = {
    current: { europeanAqi: 32, pm25: 8.1, pm10: 15.2, no2: 18.5, o3: 55.2, updatedAt: '2026-10-26T12:00:00Z' },
    hourly: [],
  };
  const WAQI: AirQualityGridPoint = { lat: 52.52, lon: 13.4, europeanAqi: 85, station: 'Berlin Mitte, Germany', url: 'https://aqicn.org/station/@6132/' };
  const SENSOR: AirQualityGridPoint = { lat: 52.5, lon: 13.42, europeanAqi: 85, station: 'Kreuzberg Sensor', url: 'https://maps.sensor.community/#17/52.5/13.42' };

  beforeEach(() => {
    hooks.airQuality = { data: AIR_QUALITY, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() };
    hooks.grid = [WAQI, SENSOR];
    hooks.stations = undefined;
  });

  it('lists WAQI stations under a US AQI heading, coloured on the US scale', () => {
    render(<AirQualityStrip expanded />);
    expect(screen.getByText('US AQI')).toBeTruthy();
    const name = screen.getByText('Berlin Mitte');
    expect(name.nextElementSibling!.textContent).toBe('85');
    // US "Moderate" yellow, not the European "Very Poor" purple, ringed so it shows on white
    const dot = name.previousElementSibling as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(255, 255, 0)');
    expect(dot.classList.contains('ring-1')).toBe(true);
    expect(screen.queryByText('Kreuzberg Sensor')).toBeNull();
  });

  it('keeps the headline on the European scale', () => {
    render(<AirQualityStrip expanded />);
    expect(screen.getByText('Fair (AQI)')).toBeTruthy();
  });

  it.each([
    ['en', 'Stations: World Air Quality Index Project and originating agencies'],
    ['de', 'Messstationen: World Air Quality Index Project und die Messnetzbetreiber'],
    ['tr', 'İstasyonlar: World Air Quality Index Project ve kaynak kurumlar'],
    ['ar', 'المحطات: World Air Quality Index Project والجهات المصدرة للبيانات'],
  ])('credits WAQI and the originating agencies under the list (%s)', async (lang, credit) => {
    await i18n.changeLanguage(lang);
    render(<AirQualityStrip expanded />);
    expect(screen.getByText(credit)).toBeTruthy();
  });

  it('centres the scale marker on the value from the scale\'s start, which is the right edge in Arabic', () => {
    // The scale's segments are a flex row, so they mirror in Arabic; a marker
    // placed with `left` did not, and pointed at the wrong end of the scale.
    render(<AirQualityStrip expanded />);
    const scale = screen.getByRole('img', { name: /^AQI 32/ });
    const marker = scale.querySelector<HTMLElement>('.absolute')!;
    expect(marker.style.insetInlineStart).toBe('32%');
    expect(marker.style.left).toBe('');
    // The marker box has no width, so a percentage translate moved nothing:
    // the dot started at the value instead of sitting on it.
    expect(marker.style.transform).toBe('');
    expect(marker.firstElementChild!.classList.contains('-ms-1.5')).toBe(true);
    expect(marker.firstElementChild!.classList.contains('w-3')).toBe(true);
  });

  it('keeps each pollutant reading and its unit in one left-to-right run, so the unit\'s margin falls between them', async () => {
    // Without the isolate the unit's ms-0.5 followed the Arabic page and
    // landed on its outer side: "8.1µg/m³".
    await i18n.changeLanguage('ar');
    render(<AirQualityStrip expanded />);
    const units = screen.getAllByText('µg/m³');
    expect(units).toHaveLength(4);
    for (const unit of units) {
      expect(unit.classList.contains('ms-0.5')).toBe(true);
      const run = unit.parentElement!;
      expect(run.tagName).toBe('BDI');
      expect(run.getAttribute('dir')).toBe('ltr');
    }
    expect(units[0].parentElement!.textContent).toBe('8.1µg/m³');
  });

  it('shows no heading or credit when there are no WAQI stations', () => {
    hooks.grid = [SENSOR];
    render(<AirQualityStrip expanded />);
    expect(screen.queryByText('US AQI')).toBeNull();
    expect(screen.queryByText(/World Air Quality Index Project/)).toBeNull();
  });

  it('says the pollutant values are the model forecast while there are no official stations', () => {
    render(<AirQualityStrip expanded />);
    expect(screen.getByText('Model forecast (CAMS)')).toBeTruthy();
  });
});

describe('AirQualityStrip official stations', () => {
  const AIR_QUALITY: AirQuality = {
    current: { europeanAqi: 32, pm25: 8.1, pm10: 15.2, no2: 18.5, o3: 55.2, updatedAt: '2026-11-03T00:00:00Z' },
    hourly: [],
  };
  const station = (s: Partial<AirQualityStation> & Pick<AirQualityStation, 'code' | 'name'>): AirQualityStation => ({
    lat: 52.5, lon: 13.4, setting: 'background', network: 'BE', measuredAt: '2026-11-02T23:00:00.000Z',
    index: 1, no2: null, pm10: null, pm25: null, o3: null, ...s,
  });
  const WAQI: AirQualityGridPoint = { lat: 52.52, lon: 13.4, europeanAqi: 85, station: 'Berlin Mitte, Germany', url: 'https://aqicn.org/station/@6132/' };

  beforeEach(() => {
    hooks.airQuality = { data: AIR_QUALITY, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() };
    hooks.grid = [WAQI];
    hooks.stationsEnabled = [];
    hooks.stations = [
      station({ code: 'DEBE010', name: 'Berlin Wedding', index: 2, no2: 37, pm10: 17, pm25: 13, o3: 3 }),
      station({ code: 'DEBE068', name: 'Berlin Mitte', index: 2, no2: 31, pm10: 19, pm25: 14 }),
      station({ code: 'DEBE065', name: 'Berlin Frankfurter Allee', setting: 'traffic', index: 3, no2: 80, pm10: 25, pm25: 18 }),
    ];
  });

  it('asks for the stations because the city has them', () => {
    render(<AirQualityStrip expanded />);
    expect(hooks.stationsEnabled.every(Boolean)).toBe(true);
  });

  it('shows the background stations’ measured means instead of the model, and the model only where none measured', () => {
    render(<AirQualityStrip expanded />);
    const units = screen.getAllByText('µg/m³').map((u) => u.parentElement!.textContent);
    // PM2.5 (13+14)/2, NO₂ (37+31)/2, PM10 (17+19)/2, O₃ from Wedding alone; the traffic station is left out
    expect(units).toEqual(['13.5µg/m³', '34.0µg/m³', '18.0µg/m³', '3.0µg/m³']);
    expect(screen.getByText('Measured at the official urban background stations, hour ending 00:00')).toBeTruthy();
    expect(screen.queryByText('(model)')).toBeNull();
  });

  it('marks a pollutant no station measured as the model’s value', () => {
    hooks.stations = [station({ code: 'DEBE068', name: 'Berlin Mitte', no2: 31 })];
    render(<AirQualityStrip expanded />);
    expect(screen.getAllByText('(model)')).toHaveLength(3);
    expect(screen.getAllByText('µg/m³')[0].parentElement!.textContent).toBe('8.1µg/m³');
  });

  it('lists the official stations worst first, by short name, with UBA’s class, instead of the WAQI list', () => {
    render(<AirQualityStrip expanded />);
    expect(screen.getByText('Official measuring stations (UBA air quality index)')).toBeTruthy();
    const names = ['Frankfurter Allee', 'Mitte', 'Wedding'].map((n) => screen.getByText(n));
    expect(names[0].compareDocumentPosition(names[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(names[1].compareDocumentPosition(names[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(names[0].parentElement!.textContent).toBe('Frankfurter AlleeTrafficPoor');
    expect(names[2].parentElement!.textContent).toBe('WeddingModerate');
    expect(screen.queryByText('US AQI')).toBeNull();
    expect(screen.getByText('Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes').getAttribute('lang')).toBe('de');
  });

  it.each([
    ['de', 'Amtliche Messstationen (Luftqualitätsindex des UBA)', 'Schlecht'],
    ['tr', 'Resmî ölçüm istasyonları (UBA hava kalitesi endeksi)', 'Kötü'],
    ['ar', 'محطات القياس الرسمية (مؤشر جودة الهواء من UBA)', 'سيئة'],
  ])('names the list and the classes in the reader’s language (%s)', async (lang, heading, poor) => {
    await i18n.changeLanguage(lang);
    render(<AirQualityStrip expanded />);
    expect(screen.getByText(heading)).toBeTruthy();
    expect(screen.getByText('Frankfurter Allee').parentElement!.textContent).toContain(poor);
  });
});
