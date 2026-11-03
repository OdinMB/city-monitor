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
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CityProvider cityId="berlin">
        <DataLayerToggles />
      </CityProvider>
    </QueryClientProvider>,
  );
}

/**
 * The button holding this label, found by its text: role queries compute every
 * button's name and are slow on a list this long. `nth` picks among equal
 * labels: the news layer and its news sub-layer are both "News".
 */
const buttonWith = (label: string, nth = 0) => screen.getAllByText(label, { exact: true })[nth].closest('button')!;
const layerButton = (layer: string) => buttonWith(i18n.t(`sidebar.layers.${layer}`));
const categoryButton = (category: string) => buttonWith(i18n.t(`sidebar.categories.${category}`));

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
    expect(categoryButton('traffic').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('weather').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('warnings').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('news').getAttribute('aria-pressed')).toBe('false');
    expect(categoryButton('social').getAttribute('aria-pressed')).toBe('false');
  });

  it('updates the state when a layer is switched', () => {
    renderToggles();
    fireEvent.click(layerButton('news'));
    expect(layerButton('news').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(categoryButton('traffic'));
    expect(categoryButton('traffic').getAttribute('aria-pressed')).toBe('false');
  });

  it('lists a category\'s layers once it is on, and opens environment with air quality', () => {
    renderToggles();
    expect(screen.queryByText(i18n.t('sidebar.layers.noise'))).toBeNull();
    fireEvent.click(categoryButton('environment'));
    expect(layerButton('air-quality').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('noise').getAttribute('aria-pressed')).toBe('false');
    expect(layerButton('water').getAttribute('aria-pressed')).toBe('false');
    expect(layerButton('heat-relief').getAttribute('aria-pressed')).toBe('false');
    expect(layerButton('trees').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(layerButton('water'));
    expect(useCommandCenter.getState().activeLayers.has('water')).toBe(true);
    // The water layer's own sub-layers, below it
    expect(buttonWith(i18n.t('sidebar.water.bathing')).getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the last entry of a category go and keeps the category on: its button switches it off', () => {
    renderToggles();
    fireEvent.click(categoryButton('social'));
    fireEvent.click(layerButton('crime'));
    fireEvent.click(layerButton('social'));
    expect([...useCommandCenter.getState().activeLayers].filter((l) => ['social', 'crime'].includes(l))).toEqual(['crime']);
    fireEvent.click(layerButton('crime'));
    expect(useCommandCenter.getState().activeLayers.has('crime')).toBe(false);
    expect(categoryButton('social').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(categoryButton('social'));
    expect(categoryButton('social').getAttribute('aria-pressed')).toBe('false');
  });

  it('lists bike sharing, accidents and EV charging among the traffic entries', () => {
    renderToggles();
    expect(layerButton('bike-sharing').getAttribute('aria-pressed')).toBe('false');
    expect(layerButton('accidents').getAttribute('aria-pressed')).toBe('false');
    expect(layerButton('ev-charging').getAttribute('aria-pressed')).toBe('false');
    expect(buttonWith(i18n.t('sidebar.traffic.incidents')).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(layerButton('bike-sharing'));
    for (const sub of ['public-transport', 'incidents', 'roadworks']) fireEvent.click(buttonWith(i18n.t(`sidebar.traffic.${sub}`)));
    expect(useCommandCenter.getState().activeLayers.has('traffic')).toBe(false);
    expect(useCommandCenter.getState().activeLayers.has('bike-sharing')).toBe(true);
    expect(screen.getByLabelText(i18n.t('sidebar.bikeLegend.title'))).toBeTruthy();
    // The last entry can go too: the category stays on, with its streets and no markers
    fireEvent.click(layerButton('bike-sharing'));
    expect(useCommandCenter.getState().activeLayers.has('bike-sharing')).toBe(false);
    expect(categoryButton('traffic').getAttribute('aria-pressed')).toBe('true');
    expect(layerButton('accidents').getAttribute('aria-pressed')).toBe('false');
    // Its own switch turns it off
    fireEvent.click(categoryButton('traffic'));
    expect(categoryButton('traffic').getAttribute('aria-pressed')).toBe('false');
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
    fireEvent.click(categoryButton('social'));
    fireEvent.click(layerButton('political'));
    const pressed = () => ['bezirke', 'bundestag', 'landesparlament'].map((key) =>
      buttonWith(i18n.t(`sidebar.political.${key}`)).getAttribute('aria-pressed'));
    expect(pressed()).toEqual(['true', 'false', 'false']);
    fireEvent.click(buttonWith(i18n.t('sidebar.political.bundestag')));
    expect(pressed()).toEqual(['false', 'true', 'false']);
  });
});

describe('DataLayerToggles shortcuts', () => {
  it('names each category by its label alone and gives its number key as a shortcut', () => {
    renderToggles();
    const warnings = layerButton('warnings');
    expect(warnings.getAttribute('aria-keyshortcuts')).toBe('1');
    expect(categoryButton('environment').getAttribute('aria-keyshortcuts')).toBe('5');
    expect(categoryButton('social').getAttribute('aria-keyshortcuts')).toBe('7');
    // The layers inside a category have no number key.
    fireEvent.click(categoryButton('social'));
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
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CityContext.Provider value={city}>
          <DataLayerToggles />
        </CityContext.Provider>
      </QueryClientProvider>,
    );
  }
  const shown = (label: string) => screen.queryAllByText(label, { exact: true }).length > 0;

  it('lists only the layers the city has', () => {
    // Each grouping category open, so its layers are listed
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['traffic', 'air-quality', 'social']) });
    renderFor(hamburg);
    // Hamburg's only lift source is DB's, and the server has no data for it here
    const expected = new Set<DataLayer>([...cityLayers(hamburg).layers].filter((l) => l !== 'lifts'));
    for (const layer of ['warnings', 'news', 'bike-sharing', 'parking', 'ev-charging', 'heat-relief', 'accidents', 'lifts', 'crime', 'weather', 'air-quality', 'noise', 'water', 'emergencies', 'social', 'population', 'political', 'reports', 'trees']) {
      expect(shown(i18n.t(`sidebar.layers.${layer}`)), layer).toBe(expected.has(layer as DataLayer));
    }
  });

  it('lists lifts and escalators under traffic once the server has outages, with their legend once on', async () => {
    const data = { outages: [{ id: 'db-1', kind: 'lift', station: 'Hamburg Hbf', unit: 'zu Gleis 3/4', lat: 53.55, lon: 10.0, info: null, operator: 'db' }], updated: null };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      new Response(JSON.stringify(String(url).includes('lift-outages') ? { data, fetchedAt: '2026-11-03T12:00:00Z' } : { data: null, fetchedAt: null })));
    renderFor(hamburg);
    const lifts = await screen.findByText(i18n.t('sidebar.layers.lifts'));
    fireEvent.click(lifts.closest('button')!);
    expect(useCommandCenter.getState().activeLayers.has('lifts')).toBe(true);
    expect(shown(i18n.t('sidebar.liftLegend.escalator'))).toBe(true);
    fetchSpy.mockRestore();
  });

  it('lists the heat-relief lists a city has, and none for a city with one list', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['heat-relief']) });
    renderFor(muenchen);
    expect(shown(i18n.t('sidebar.heatRelief.fountains'))).toBe(true);
    expect(shown(i18n.t('sidebar.heatRelief.toilets'))).toBe(true);
    expect(shown(i18n.t('sidebar.heatRelief.cool'))).toBe(false);
    cleanup();
    // Hamburg has fountains alone: the layer is that list
    renderFor(hamburg);
    expect(shown(i18n.t('sidebar.layers.heat-relief'))).toBe(true);
    expect(shown(i18n.t('sidebar.heatRelief.fountains'))).toBe(false);
    cleanup();
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
    // Hamburg has the Bundestag and election views; its water layer has gauges and bathing spots.
    expect(shown(i18n.t('sidebar.political.bundestag'))).toBe(true);
    expect(shown(i18n.t('sidebar.political.elections'))).toBe(true);
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
    // No hospitals stored: the hospitals sub-layer stays hidden
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: null, fetchedAt: null })));
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['emergencies']), emergencySubLayers: new Set(['pharmacies']) });
    const noHospitals = (f: string) => f !== 'hospitals';
    renderFor({ ...hamburg, features: hamburg.features.filter(noHospitals) });
    expect(shown(i18n.t('sidebar.emergencies.pharmacies'))).toBe(true);
    expect(shown(i18n.t('sidebar.emergencies.aeds'))).toBe(true);
    cleanup();

    renderFor({ ...hamburg, features: hamburg.features.filter((f) => noHospitals(f) && f !== 'pharmacies') });
    expect(shown(i18n.t('sidebar.layers.emergencies'))).toBe(true);
    // A lone sub-layer is the layer itself.
    expect(shown(i18n.t('sidebar.emergencies.pharmacies'))).toBe(false);
    cleanup();

    renderFor({ ...hamburg, features: hamburg.features.filter((f) => noHospitals(f) && f !== 'pharmacies' && f !== 'aeds') });
    expect(shown(i18n.t('sidebar.layers.emergencies'))).toBe(false);
    fetchSpy.mockRestore();
  });

  it('offers hospitals as an emergencies sub-layer only once the server has some, with the tier legend once on', async () => {
    const hospital = {
      id: 'hh-1', name: 'Klinik Nord', address: 'Weg 1, 22000 Hamburg', lat: 53.6, lon: 10, tier: 'emergency',
      children: false, strokeUnit: false, chestPainUnit: false, trauma: false, beds: null, url: null, source: 'hamburg-wfs',
    };
    let hospitals: unknown[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ data: { hospitals, atlasDate: null }, fetchedAt: '2026-11-03T12:00:00Z' })));
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['emergencies']), emergencySubLayers: new Set(['pharmacies']) });
    renderFor(hamburg);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(shown(i18n.t('sidebar.emergencies.hospitals'))).toBe(false);
    cleanup();

    hospitals = [hospital];
    renderFor(hamburg);
    expect(await screen.findByText(i18n.t('sidebar.emergencies.hospitals'))).toBeTruthy();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/hamburg/hospitals'))).toBe(true);
    fireEvent.click(buttonWith(i18n.t('sidebar.emergencies.hospitals')));
    expect(await screen.findByLabelText(i18n.t('sidebar.hospitalLegend'))).toBeTruthy();
    expect(shown(i18n.t('mapPopup.hospital.tier.emergency'))).toBe(true);
    expect(shown(i18n.t('mapPopup.hospital.tier.comprehensive'))).toBe(false);
    fetchSpy.mockRestore();
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
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/koeln/citizen-reports'))).toBe(true);
    // Open and in progress on the map; closed ones on request
    const status = (s: string) => buttonWith(i18n.t(`mapPopup.reports.status.${s}`));
    expect(['open', 'in_progress', 'closed'].map((s) => status(s).getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false']);
    fireEvent.click(status('closed'));
    expect(status('closed').getAttribute('aria-pressed')).toBe('true');
    expect(useCommandCenter.getState().reportStatuses.has('closed')).toBe(true);
    fetchSpy.mockRestore();
  });

  it('lists street trees where a city has a tree register, with the zoom and click hints once on', () => {
    renderFor(muenchen);
    expect(shown(i18n.t('sidebar.layers.trees'))).toBe(false);
    cleanup();
    renderFor(koeln);
    expect(shown(i18n.t('sidebar.trees.zoomIn'))).toBe(false);
    fireEvent.click(categoryButton('environment'));
    fireEvent.click(layerButton('trees'));
    expect(layerButton('trees').getAttribute('aria-pressed')).toBe('true');
    expect(shown(i18n.t('sidebar.trees.zoomIn'))).toBe(true);
    expect(shown(i18n.t('sidebar.trees.hint'))).toBe(true);
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
