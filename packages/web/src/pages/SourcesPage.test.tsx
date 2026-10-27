import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { CityConfig } from '@city-monitor/shared';
import { CityProvider } from '../hooks/CityProvider.js';
import { CityContext } from '../hooks/CityContext.js';
import { getNoiseWmsUrl } from '../components/map/constants.js';
import { SourcesPage } from './SourcesPage.js';
import { AI_COPY_LANGS, APPROVED_AI_COPY } from '../test-fixtures/approved-ai-copy.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <CityProvider cityId="berlin">
        <SourcesPage />
      </CityProvider>
    </MemoryRouter>,
  );
}

/** The city configs one `config/cities/` folder exports. */
function citiesIn(modules: Record<string, Record<string, CityConfig>>): CityConfig[] {
  return Object.values(modules).flatMap((module) => Object.values(module));
}

/**
 * Each city's server config, read from the server package: its dataSources
 * decide which ingestion jobs run for the city. The page itself gets the web
 * config of the same id, active or not.
 */
const SERVER_CITIES = citiesIn(import.meta.glob<Record<string, CityConfig>>('../../../server/src/config/cities/*.ts', { eager: true }));
const WEB_CITIES = new Map(citiesIn(import.meta.glob<Record<string, CityConfig>>('../config/cities/*.ts', { eager: true })).map((c) => [c.id, c]));
const CITIES = SERVER_CITIES.filter((c) => WEB_CITIES.has(c.id));

function renderCity(cityId: string) {
  return render(
    <MemoryRouter>
      <CityContext.Provider value={WEB_CITIES.get(cityId)!}>
        <SourcesPage />
      </CityContext.Provider>
    </MemoryRouter>,
  );
}

/** The source cards on the rendered page: name, link and text. */
function creditedCards(): Array<{ name: string; host: string; text: string; section: string }> {
  return within(screen.getByRole('article')).getAllByRole('link').map((link) => ({
    name: link.textContent ?? '',
    host: new URL(link.getAttribute('href')!).hostname,
    text: link.parentElement!.textContent ?? '',
    section: link.closest('section')!.querySelector('h2')!.textContent ?? '',
  }));
}

const usesEvents = (c: CityConfig, source: string) => c.dataSources.events?.some((e) => e.source === source) ?? false;
const berlinOnly = (c: CityConfig) => c.id === 'berlin';

/**
 * Credits whose use the city decides, each with the condition its ingestion
 * job checks (packages/server/src/cron/ingest-*.ts). Berlin-only jobs
 * (BERLIN_ONLY_JOBS in app.ts) fetch for Berlin alone. The political job keeps
 * its parliaments in its own module, not the config, so abgeordnetenwatch.de
 * is not checked here.
 */
const CONFIG_DRIVEN: ReadonlyArray<[credit: string, runs: (city: CityConfig) => boolean]> = [
  // ingest-weather: forecast and air quality from its one provider, warnings and UV for German cities
  ['Bright Sky', (c) => c.dataSources.weather.provider === 'brightsky'],
  ['Open-Meteo Air Quality', (c) => c.dataSources.weather.provider === 'brightsky'],
  ['Copernicus Atmosphere Monitoring Service (CAMS)', (c) => c.dataSources.weather.provider === 'brightsky'],
  ['DWD (Deutscher Wetterdienst)', (c) => c.country === 'DE'],
  // ingest-aq-grid: WAQI for every city, Sensor.Community for the sensors a city lists
  ['WAQI (World Air Quality Index Project)', () => true],
  ['Sensor.Community', (c) => (c.dataSources.airQuality?.sensorCommunityStations?.length ?? 0) > 0],
  ['Sensor.Community DNMS', (c) => c.dataSources.noiseSensors !== undefined],
  ['NINA (BBK)', (c) => c.country === 'DE' && c.dataSources.nina !== undefined],
  ['aponet.de', (c) => c.country === 'DE'],
  ['OpenStreetMap', (c) => c.country === 'DE'],
  ['TomTom Traffic', () => true],
  ['VBB transport.rest', (c) => (c.dataSources.transit?.stations?.length ?? 0) > 0],
  ['VIZ Berlin', (c) => c.dataSources.roadworks !== undefined],
  ['PEGELONLINE (WSV)', (c) => c.dataSources.waterLevels !== undefined],
  ['Ticketmaster', (c) => usesEvents(c, 'ticketmaster')],
  ['kulturdaten.berlin', (c) => usesEvents(c, 'kulturdaten')],
  ['go~mus (State Museums)', (c) => usesEvents(c, 'gomus')],
  ['service.berlin.de', (c) => c.dataSources.appointments !== undefined],
  ['Berlin Budget (Doppelhaushalt)', (c) => c.dataSources.budget !== undefined],
  ['MSS 2023 (Social Atlas)', (c) => c.dataSources.socialAtlas !== undefined],
  ['ALLRIS OParl (BVV)', (c) => (c.dataSources.councilMeetings?.bvv.length ?? 0) > 0],
  ['PARDOK (Abgeordnetenhaus)', (c) => c.dataSources.councilMeetings?.parliament !== undefined],
  ['LAGeSo Bathing Water', berlinOnly],
  ['LAGeSo Wastewater Monitoring', berlinOnly],
  ['RKI AMELAG Wastewater Surveillance', berlinOnly],
  ['Bundesagentur für Arbeit', berlinOnly],
  ['Amt für Statistik Berlin-Brandenburg', berlinOnly],
  ['Berliner Feuerwehr Open Data', berlinOnly],
];

describe('SourcesPage credits per city', () => {
  it('covers every city configured in both packages', () => {
    expect(CITIES.map((c) => c.id)).toEqual(expect.arrayContaining(['berlin', 'hamburg']));
  });

  it.each(CITIES.map((c) => [c.id, c] as const))('credits the sources that run for %s, and none that do not', (id, city) => {
    renderCity(id);
    const credited = new Set(creditedCards().map((card) => card.name));

    const expected = CONFIG_DRIVEN.filter(([, runs]) => runs(city)).map(([credit]) => credit);
    const actual = CONFIG_DRIVEN.filter(([credit]) => credited.has(credit)).map(([credit]) => credit);
    expect(actual).toEqual(expected);
  });

  it.each(CITIES.map((c) => [c.id, c] as const))('credits each news and police feed of %s, and no other news source', (id, city) => {
    renderCity(id);
    const cards = creditedCards();
    const feedHosts = new Set(city.feeds.map((f) => new URL(f.url).hostname));
    const creditedHosts = new Set(cards.map((card) => card.host));

    for (const host of feedHosts) expect(creditedHosts, host).toContain(host);
    if (city.dataSources.police) expect(creditedHosts).toContain(new URL(city.dataSources.police.url).hostname);
    for (const card of cards.filter((c) => c.section === 'News')) expect(feedHosts, card.name).toContain(card.host);
  });

  it.each(CITIES.map((c) => [c.id] as const))('credits the host of the noise map on %s', (id) => {
    renderCity(id);
    const wms = getNoiseWmsUrl(id, 'road');
    if (wms) expect(creditedCards().map((card) => card.host)).toContain(new URL(wms).hostname);
  });

  it('leaves the events and Sensor.Community sources off Hamburg, which has none', () => {
    renderCity('hamburg');
    expect(screen.queryByRole('link', { name: 'Ticketmaster' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Events' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Sensor\.Community/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'abgeordnetenwatch.de' })).toBeTruthy();
  });
});

describe('SourcesPage licence credits', () => {
  /**
   * The credit each source's licence asks for, as the repo records the licence
   * (.context/ and .plans/completed/ for each source). ODbL: "© <holder>
   * contributors, ODbL".
   */
  const LICENCE_CREDITS: Record<string, string> = {
    'OpenStreetMap': '© OpenStreetMap contributors, ODbL.',
    'Sensor.Community': '© Sensor.Community contributors, ODbL.',
    'Sensor.Community DNMS': '© Sensor.Community contributors, ODbL.',
    'RKI AMELAG Wastewater Surveillance': 'Source: Robert Koch-Institut, CC BY 4.0.',
    'LAGeSo Wastewater Monitoring': 'Source: Lageso Berlin and Berliner Wasserbetriebe, dl-de/by-2-0.',
    'Amt für Statistik Berlin-Brandenburg': 'Source: Amt für Statistik Berlin-Brandenburg, CC BY.',
    'VIZ Berlin': 'Source: Digitale Plattform Stadtverkehr Berlin, dl-de/by-2-0.',
    'Berlin Budget (Doppelhaushalt)': 'Licensed CC BY.',
    'ALLRIS OParl (BVV)': 'Licensed CC BY 3.0 DE.',
    'Hamburg Noise Map (Geodienste)': 'Licensed dl-de/by-2-0.',
  };

  it('finds every listed source on some city page', () => {
    const seen = new Set<string>();
    for (const city of CITIES) {
      const { unmount } = renderCity(city.id);
      for (const card of creditedCards()) seen.add(card.name);
      unmount();
    }
    expect(Object.keys(LICENCE_CREDITS).filter((name) => !seen.has(name))).toEqual([]);
  });

  it.each(CITIES.map((c) => [c.id] as const))('gives each licensed source on %s the credit its licence asks for', (id) => {
    renderCity(id);
    const licensed = creditedCards().filter((card) => card.name in LICENCE_CREDITS);
    expect(licensed.length).toBeGreaterThan(0);
    for (const card of licensed) expect(card.text, card.name).toContain(LICENCE_CREDITS[card.name]);
  });
});

describe('SourcesPage air quality credit', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  // Source entries are English in every UI language (only the AI section is
  // localized), so the credit must render unchanged whichever language is set.
  it.each(['en', 'de', 'tr', 'ar'])('credits CAMS next to Open-Meteo air quality (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    renderPage();

    const openMeteo = screen.getByRole('link', { name: 'Open-Meteo Air Quality' });
    const cams = screen.getByRole('link', { name: 'Copernicus Atmosphere Monitoring Service (CAMS)' });
    expect(cams.getAttribute('href')).toBe('https://atmosphere.copernicus.eu/');

    // The CAMS card directly follows the Open-Meteo air quality card.
    expect(openMeteo.parentElement!.nextElementSibling).toBe(cams.parentElement);

    const year = new Date().getFullYear();
    expect(
      within(cams.parentElement!).getByText(
        new RegExp(`Contains modified Copernicus Atmosphere Monitoring Service information ${year}\\.`),
      ),
    ).toBeTruthy();
    expect(
      within(cams.parentElement!).getByText(/Neither the European Commission nor ECMWF is responsible/),
    ).toBeTruthy();
  });
});

describe('SourcesPage WAQI credit', () => {
  it('names the agencies behind the WAQI stations, in the weather group', () => {
    renderPage();

    const waqi = screen.getByRole('link', { name: 'WAQI (World Air Quality Index Project)' });
    expect(waqi.getAttribute('href')).toBe('https://waqi.info/');
    const card = waqi.parentElement!;
    expect(within(card).getByText(
      /Data from the Umweltbundesamt \(German Environment Agency\) and the Berlin air quality monitoring network \(BLUME\), via the World Air Quality Index Project\./,
    )).toBeTruthy();
    expect(within(card).getByText(/not archived/)).toBeTruthy();

    const section = waqi.closest('section')!;
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('Weather & Environment');
    expect(screen.getAllByRole('link', { name: /WAQI/ })).toHaveLength(1);
  });
});

describe('SourcesPage AI section', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(AI_COPY_LANGS)('describes the AI processing in the UI language (%s)', async (lang) => {
    const copy = APPROVED_AI_COPY[lang];
    await i18n.changeLanguage(lang);
    renderPage();

    const heading = screen.getByRole('heading', { level: 2, name: copy.sourcesTitle });
    const section = heading.closest('section')!;
    expect(within(section).getByRole('link', { name: 'OpenAI' })).toBeTruthy();
    expect(within(section).getByText(copy.sourcesDescription)).toBeTruthy();
  });
});
