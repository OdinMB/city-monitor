import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import type { WebCityConfig } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { CityContext } from '../../hooks/CityContext.js';
import { berlin } from '../../config/cities/berlin.js';
import { hamburg } from '../../config/cities/hamburg.js';
import { koeln } from '../../config/cities/koeln.js';
import { muenchen } from '../../config/cities/muenchen.js';
import { cityLayers } from '../../lib/map-layers.js';
import { useCommandCenter, type DataLayer } from '../../hooks/useCommandCenter.js';
import { useShortcutSettings } from '../../hooks/useShortcutSettings.js';
import { DataLayerToggles } from './DataLayerToggles.js';

const initialLayers = useCommandCenter.getState();
const initialShortcuts = useShortcutSettings.getState();

function renderToggles() {
  return render(
    <CityProvider cityId="berlin">
      <DataLayerToggles />
    </CityProvider>,
  );
}

/**
 * The button holding this label, found by its text: role queries compute every
 * button's name and are slow on a list this long. `nth` picks among equal
 * labels: the news layer and its news sub-layer are both "News".
 */
const buttonWith = (label: string, nth = 0) => screen.getAllByText(label, { exact: true })[nth].closest('button')!;
const layerButton = (layer: string) => buttonWith(i18n.t(`sidebar.layers.${layer}`));

beforeEach(() => {
  useCommandCenter.setState(initialLayers, true);
  useShortcutSettings.setState(initialShortcuts, true);
});

afterEach(() => {
  cleanup();
});

describe('DataLayerToggles state', () => {
  it('says which layers are on, not only by colour', () => {
    renderToggles();
    // Traffic, rain radar and warnings are on by default.
    expect(layerButton('traffic').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('weather').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('warnings').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('news').getAttribute('aria-pressed')).toBe('false');
    expect(layerButton('political').getAttribute('aria-pressed')).toBe('false');
  });

  it('updates the state when a layer is switched', () => {
    renderToggles();
    fireEvent.click(layerButton('news'));
    expect(layerButton('news').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(layerButton('traffic'));
    expect(layerButton('traffic').getAttribute('aria-pressed')).toBe('false');
  });

  it('says which sub-layers are on, for those that combine', () => {
    renderToggles();
    // Traffic starts with all three sub-layers on.
    const transport = buttonWith(i18n.t('sidebar.traffic.public-transport'));
    expect(transport.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(transport);
    expect(transport.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(layerButton('news'));
    expect(buttonWith(i18n.t('sidebar.news.news'), 1).getAttribute('aria-pressed')).toBe('true');
    expect(buttonWith(i18n.t('sidebar.news.police')).getAttribute('aria-pressed')).toBe('false');
  });

  it('says which sub-layer is chosen, for those where one is', () => {
    renderToggles();
    fireEvent.click(layerButton('political'));
    const pressed = () => ['bezirke', 'bundestag', 'landesparlament'].map((key) =>
      buttonWith(i18n.t(`sidebar.political.${key}`)).getAttribute('aria-pressed'));
    expect(pressed()).toEqual(['true', 'false', 'false']);
    fireEvent.click(buttonWith(i18n.t('sidebar.political.bundestag')));
    expect(pressed()).toEqual(['false', 'true', 'false']);
  });
});

describe('DataLayerToggles shortcuts', () => {
  it('names each layer by its label alone and gives its number key as a shortcut', () => {
    renderToggles();
    const warnings = layerButton('warnings');
    expect(warnings.getAttribute('aria-keyshortcuts')).toBe('1');
    expect(layerButton('social').getAttribute('aria-keyshortcuts')).toBe('9');
    // Population and representation have no number key.
    expect(layerButton('population').hasAttribute('aria-keyshortcuts')).toBe(false);
    // The digit is shown, but not read as part of the name.
    const digit = [...warnings.querySelectorAll('span')].find((el) => el.textContent === '1' && el.childElementCount === 0)!;
    expect(digit.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: i18n.t('sidebar.layers.warnings') })).toBe(warnings);
  });

  it('drops the number badges and shortcut hints once single-key shortcuts are off', () => {
    useShortcutSettings.setState({ enabled: false });
    renderToggles();
    const warnings = layerButton('warnings');
    expect(warnings.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect([...warnings.querySelectorAll('span')].some((el) => el.textContent === '1')).toBe(false);
  });

  it('opens the keyboard shortcuts dialog from its heading', () => {
    renderToggles();
    const opener = screen.getByRole('button', { name: i18n.t('shortcuts.title') });
    expect(opener.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(opener);
    expect(useShortcutSettings.getState().hintsOpen).toBe(true);
  });
});

describe('DataLayerToggles per city', () => {
  function renderFor(city: WebCityConfig) {
    return render(
      <CityContext.Provider value={city}>
        <DataLayerToggles />
      </CityContext.Provider>,
    );
  }
  const shown = (label: string) => screen.queryAllByText(label, { exact: true }).length > 0;

  it('lists only the layers the city has', () => {
    renderFor(hamburg);
    const expected = cityLayers(hamburg).layers;
    for (const layer of ['warnings', 'news', 'traffic', 'bike-sharing', 'ev-charging', 'accidents', 'weather', 'air-quality', 'noise', 'water', 'emergencies', 'social', 'population', 'political']) {
      expect(shown(i18n.t(`sidebar.layers.${layer}`)), layer).toBe(expected.has(layer as DataLayer));
    }
  });

  it('names each social-atlas indicator the way the city\'s source defines it, with its edition', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['social']) });
    renderFor(koeln);
    expect(shown('Unemployment rate (2025)')).toBe(true);
    expect(shown('Single-parent households (2025)')).toBe(true);
    expect(shown('SGB II recipients (2025)')).toBe(true);
    // No child-poverty figure in Köln's source, and no rent map
    expect(shown('Child poverty (2025)')).toBe(false);
    expect(shown(i18n.t('sidebar.social.rent'))).toBe(false);
    cleanup();

    renderFor(hamburg);
    expect(shown('Children on minimum income (2025)')).toBe(true);
    expect(shown('Unemployment (2025)')).toBe(true);
    cleanup();

    // München's 25 Stadtbezirke are far coarser than the other cities' areas: the label says so
    renderFor(muenchen);
    expect(shown('Unemployment (2024, 25 districts only)')).toBe(true);
    expect(shown('Single-parent households (2024, 25 districts only)')).toBe(true);
    expect(shown('Employable SGB II recipients (2024, 25 districts only)')).toBe(true);
    expect(shown('Children under 15 on SGB II (2024, 25 districts only)')).toBe(true);
  });

  it('lists a layer\'s sub-layers only when the city has more than one', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['traffic', 'water', 'noise', 'political', 'news']) });
    renderFor(hamburg);
    // Hamburg has only the Bundestag view; its water layer has gauges and bathing spots.
    expect(shown(i18n.t('sidebar.political.bundestag'))).toBe(false);
    expect(shown(i18n.t('sidebar.water.levels'))).toBe(true);
    expect(shown(i18n.t('sidebar.water.bathing'))).toBe(true);
    // It has traffic incidents and roadworks, news and police, and three noise maps without
    // the all-sources one or live sensors.
    expect(shown(i18n.t('sidebar.traffic.incidents'))).toBe(true);
    expect(shown(i18n.t('sidebar.traffic.roadworks'))).toBe(true);
    expect(shown(i18n.t('sidebar.news.police'))).toBe(true);
    expect(['road', 'rail', 'air'].every((key) => shown(i18n.t(`sidebar.noise.${key}`)))).toBe(true);
    expect(shown(i18n.t('sidebar.noise.total'))).toBe(false);
    expect(shown(i18n.t('sidebar.noise.live'))).toBe(false);
  });

  it('lists the emergencies layer only with pharmacies or defibrillators, and only the ones the city has', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['emergencies']), emergencySubLayers: new Set(['pharmacies']) });
    renderFor(hamburg);
    expect(shown(i18n.t('sidebar.emergencies.pharmacies'))).toBe(true);
    expect(shown(i18n.t('sidebar.emergencies.aeds'))).toBe(true);
    cleanup();

    renderFor({ ...hamburg, features: hamburg.features.filter((f) => f !== 'pharmacies') });
    expect(shown(i18n.t('sidebar.layers.emergencies'))).toBe(true);
    // A lone sub-layer is the layer itself.
    expect(shown(i18n.t('sidebar.emergencies.pharmacies'))).toBe(false);
    cleanup();

    renderFor({ ...hamburg, features: hamburg.features.filter((f) => f !== 'pharmacies' && f !== 'aeds') });
    expect(shown(i18n.t('sidebar.layers.emergencies'))).toBe(false);
  });

  it('offers Hamburg\'s congestion map and counters as traffic sub-layers, each with its legend once on', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['traffic']), trafficSubLayers: new Set(['incidents']) });
    renderFor(hamburg);
    expect(shown(i18n.t('sidebar.traffic.congestion'))).toBe(true);
    expect(shown(i18n.t('sidebar.traffic.car-counts'))).toBe(true);
    expect(shown(i18n.t('sidebar.traffic.bike-counts'))).toBe(true);
    expect(shown(i18n.t('sidebar.trafficFlowLegend.jammed'))).toBe(false);
    expect(shown(i18n.t('sidebar.trafficCountLegend.usual'))).toBe(false);

    fireEvent.click(buttonWith(i18n.t('sidebar.traffic.congestion')));
    expect(shown(i18n.t('sidebar.trafficFlowLegend.jammed'))).toBe(true);
    // The Verkehrslage draws nothing at the zoom Hamburg opens with
    expect(shown(i18n.t('sidebar.traffic.zoomIn'))).toBe(true);
    fireEvent.click(buttonWith(i18n.t('sidebar.traffic.bike-counts')));
    expect(shown(i18n.t('sidebar.trafficCountLegend.usual'))).toBe(true);
    cleanup();

    renderFor(berlin);
    expect(shown(i18n.t('sidebar.traffic.congestion'))).toBe(false);
    expect(shown(i18n.t('sidebar.traffic.car-counts'))).toBe(false);
  });

  it('shows each city\'s own rent-map legend under its rent map', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['social']) });
    renderFor(hamburg);
    // Hamburg's social atlas comes first; the legend only with the rent map
    expect(shown(i18n.t('sidebar.rentLegend.normal'))).toBe(false);
    fireEvent.click(buttonWith(i18n.t('sidebar.social.rent')));
    expect(shown(i18n.t('sidebar.rentLegend.normal'))).toBe(true);
    expect(shown(i18n.t('sidebar.rentLegend.good'))).toBe(true);
    expect(shown(i18n.t('sidebar.rentLegend.simple'))).toBe(false);
  });

  it('lists citizen reports for Köln only, with the status legend and counts once the layer is on', async () => {
    renderFor(hamburg);
    expect(shown(i18n.t('sidebar.layers.reports'))).toBe(false);
    cleanup();

    const data = {
      reports: [], windowDays: 14, total: 9, counts: { open: 4, in_progress: 2, closed: 3 },
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data, fetchedAt: '2026-11-03T12:00:00Z' })));
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['reports']) });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CityContext.Provider value={koeln}>
          <DataLayerToggles />
        </CityContext.Provider>
      </QueryClientProvider>,
    );
    expect(layerButton('reports').getAttribute('aria-pressed')).toBe('true');
    expect(shown(i18n.t('mapPopup.reports.status.in_progress'))).toBe(true);
    expect(await screen.findByText(i18n.t('sidebar.reports.window', { days: 14 }))).toBeTruthy();
    expect(shown('4') && shown('2') && shown('3')).toBe(true);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('/koeln/citizen-reports');
    fetchSpy.mockRestore();
  });

  it('marks the noise map shown where the selected one is missing', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['noise']), noiseLayer: 'total' });
    renderFor(hamburg);
    expect(buttonWith(i18n.t('sidebar.noise.road')).getAttribute('aria-pressed')).toBe('true');
  });

  it('asks to zoom in where the noise map draws only at street level', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['noise']) });
    // NRW's noise map, Köln's, is empty further out than zoom 13.
    renderFor(koeln);
    expect(['road', 'rail', 'air'].every((key) => shown(i18n.t(`sidebar.noise.${key}`)))).toBe(true);
    expect(shown(i18n.t('sidebar.noise.zoomIn'))).toBe(true);
    cleanup();

    renderFor(hamburg);
    expect(shown(i18n.t('sidebar.noise.zoomIn'))).toBe(false);
  });
});
