import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { DwdHeatTrend, WeatherAlert, WebCityConfig } from '@city-monitor/shared';
import { CityContext } from '../hooks/CityContext.js';
import { useCommandCenter, type DataLayer } from '../hooks/useCommandCenter.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { HeatReliefHint } from './HeatReliefHint.js';

const HEAT: WeatherAlert = { headline: 'Amtliche WARNUNG vor HITZE', severity: 'moderate', description: '', validUntil: '2026-07-15T17:00:00Z', kind: 'heat' };
const QUIET: DwdHeatTrend = { issued: '2026-07-15', days: [0, 0, 0, 0, 0, 0, 0, 0] };
const OUTLOOK: DwdHeatTrend = { issued: '2026-07-15', days: [0, 0, 3, 3, 0, 0, 0, 0] };

function renderFor(city: WebCityConfig, alerts: WeatherAlert[], trend?: DwdHeatTrend) {
  return render(
    <CityContext.Provider value={city}>
      <HeatReliefHint alerts={alerts} trend={trend} />
    </CityContext.Provider>,
  );
}

describe('HeatReliefHint', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['weather']), singleView: false });
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  it('points to the city\'s heat-relief lists while a heat warning is in force', () => {
    renderFor(berlin, [HEAT]);
    expect(screen.getByText('Heat warning in force')).toBeTruthy();
    expect(screen.getByText('On the map: Cool Places, Drinking Fountains, Public Toilets')).toBeTruthy();
  });

  it('names only the lists the city has', () => {
    renderFor(hamburg, [], OUTLOOK);
    expect(screen.getByText('Heat expected in the coming days')).toBeTruthy();
    expect(screen.getByText('On the map: Drinking Fountains')).toBeTruthy();
  });

  it('turns the layer on and scrolls up to the map', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderFor(berlin, [HEAT]);
    fireEvent.click(screen.getByRole('button', { name: 'Show on the map' }));
    expect(useCommandCenter.getState().activeLayers.has('heat-relief')).toBe(true);
    expect(useCommandCenter.getState().activeLayers.has('weather')).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('shows nothing without heat', () => {
    const { container } = renderFor(berlin, [], QUIET);
    expect(container.textContent).toBe('');
  });

  it('shows nothing for a city without the layer', () => {
    const { container } = renderFor({ ...berlin, features: [] }, [HEAT]);
    expect(container.textContent).toBe('');
  });

  it('speaks the reader\'s language', async () => {
    await i18n.changeLanguage('de');
    renderFor(hamburg, [HEAT]);
    expect(screen.getByText('Hitzewarnung in Kraft')).toBeTruthy();
    expect(screen.getByText('Auf der Karte: Trinkbrunnen')).toBeTruthy();
  });
});
