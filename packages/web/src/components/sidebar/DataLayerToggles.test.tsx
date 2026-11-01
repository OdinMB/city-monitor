import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import type { WebCityConfig } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { CityContext } from '../../hooks/CityContext.js';
import { hamburg } from '../../config/cities/hamburg.js';
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
    for (const layer of ['warnings', 'news', 'traffic', 'weather', 'air-quality', 'noise', 'water', 'emergencies', 'social', 'population', 'political']) {
      expect(shown(i18n.t(`sidebar.layers.${layer}`)), layer).toBe(expected.has(layer as DataLayer));
    }
  });

  it('lists a layer\'s sub-layers only when the city has more than one', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['traffic', 'water', 'noise', 'political', 'news']) });
    renderFor(hamburg);
    // Hamburg has only the traffic incidents, the river gauges and the Bundestag view.
    expect(shown(i18n.t('sidebar.traffic.incidents'))).toBe(false);
    expect(shown(i18n.t('sidebar.water.levels'))).toBe(false);
    expect(shown(i18n.t('sidebar.political.bundestag'))).toBe(false);
    // It has news and police, and three noise maps without the all-sources one or live sensors.
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

  it('marks the noise map shown where the selected one is missing', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['noise']), noiseLayer: 'total' });
    renderFor(hamburg);
    expect(buttonWith(i18n.t('sidebar.noise.road')).getAttribute('aria-pressed')).toBe('true');
  });
});
