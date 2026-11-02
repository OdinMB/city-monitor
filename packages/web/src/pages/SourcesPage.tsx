import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { CityFeature, WebCityConfig } from '@city-monitor/shared';
import { useCityConfig } from '../hooks/useCityConfig.js';
import { PageShell } from '../components/layout/PageShell.js';
import { CitySwitcher } from '../components/layout/CitySwitcher.js';
import { getAllCities } from '../config/index.js';
import { safeUrl } from '../lib/safe-url.js';
import { waqiAgencies } from '../lib/aqi.js';

interface Source {
  name: string;
  url: string;
  description: string;
  /**
   * A shared source credited only on these cities' pages: one whose job runs
   * only where a city's server config enables it. SourcesPage.test.tsx checks
   * the credits against the server configs.
   */
  cities?: readonly string[];
  /** A shared source credited only where the city has this feature, or one of these features. */
  requires?: CityFeature | readonly CityFeature[];
}

interface SourceGroup {
  category: string;
  sources: Source[];
}

/**
 * Year in the Copernicus licence notice: the year of the CAMS data shown,
 * which is always current because the air quality values are a live forecast.
 */
const CAMS_NOTICE_YEAR = new Date().getFullYear();

const SHARED_SOURCES: SourceGroup[] = [
  {
    category: 'Weather & Environment',
    sources: [
      {
        name: 'Bright Sky',
        url: 'https://brightsky.dev/',
        description: 'Current weather conditions (temperature, humidity, wind, precipitation) and 7-day forecast — a free, open-source API for Deutscher Wetterdienst (DWD) open data.',
      },
      {
        name: 'Open-Meteo Air Quality',
        url: 'https://open-meteo.com/en/docs/air-quality-api',
        description: 'European Air Quality Index (AQI), PM2.5, PM10, NO2, and ozone levels, based on the CAMS European air quality forecast.',
      },
      {
        name: 'Copernicus Atmosphere Monitoring Service (CAMS)',
        url: 'https://atmosphere.copernicus.eu/',
        description: `CAMS European air quality forecasts (ENSEMBLE data), the source of the Open-Meteo air quality values. Contains modified Copernicus Atmosphere Monitoring Service information ${CAMS_NOTICE_YEAR}. Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains.`,
      },
      {
        name: 'RainViewer',
        url: 'https://www.rainviewer.com/',
        description: 'Precipitation radar tiles for the rain radar map overlay.',
      },
      {
        name: 'DWD (Deutscher Wetterdienst)',
        url: 'https://www.dwd.de/',
        description: 'Weather observations and forecast (via Bright Sky), official severe weather warnings, pollen forecast (Pollenflug-Gefahrenindex), and UV index forecast. Source: Deutscher Wetterdienst. City Monitor derives the daily summaries and feels-like temperature from this data.',
      },
    ],
  },
  {
    category: 'Safety & Emergencies',
    sources: [
      {
        name: 'NINA (BBK)',
        url: 'https://warnung.bund.de/',
        description: 'Official civil protection warnings (MOWAS, BIWAPP, KATWARN) from the Federal Office of Civil Protection.',
        requires: 'nina',
      },
      {
        name: 'aponet.de',
        url: 'https://www.aponet.de/',
        description: 'On-call emergency pharmacy locations and hours.',
        requires: 'pharmacies',
      },
      {
        name: 'OpenStreetMap',
        url: 'https://www.openstreetmap.org/copyright',
        description: 'Automated external defibrillator (AED) locations (via the Overpass API), and the place search (Nominatim) that puts news items and police reports on the map. © OpenStreetMap contributors, ODbL.',
      },
    ],
  },
  {
    category: 'Events',
    sources: [
      {
        name: 'Ticketmaster',
        url: 'https://www.ticketmaster.com/',
        description: 'Ticketed events — concerts, sports, theater.',
        cities: ['berlin'],
      },
    ],
  },
  {
    category: 'Politics',
    sources: [
      {
        name: 'abgeordnetenwatch.de',
        url: 'https://www.abgeordnetenwatch.de/',
        description: 'Members of the Bundestag and the state parliament for the city\'s constituencies. Licensed CC0 1.0.',
        requires: 'political',
      },
    ],
  },
  {
    category: 'Maps',
    sources: [
      {
        name: 'CARTO',
        url: 'https://carto.com/',
        description: 'Base map tiles for the interactive map.',
      },
    ],
  },
];

/**
 * The AI section, in the UI language unlike the rest of this page (the AI
 * disclosure must reach readers in their language). It names the vendor but
 * no model, so it cannot drift from the models configured in the server's
 * `lib/llm-client.ts`.
 */
function aiProcessingGroup(t: TFunction): SourceGroup {
  return {
    category: t('sources.aiProcessing.title'),
    sources: [
      {
        name: 'OpenAI',
        url: 'https://openai.com/',
        description: t('sources.aiProcessing.description'),
        // The LLM reads only news items and police reports, so a city with neither makes no AI calls.
        requires: ['news', 'police'],
      },
    ],
  };
}

/**
 * WAQI, credited with the agencies whose stations it relays for the city, as
 * its terms require. Sits at the end of the weather group, merged in by category.
 */
function waqiGroup(cityId: string): SourceGroup {
  const agencies = waqiAgencies(cityId);
  return {
    category: 'Weather & Environment',
    sources: [
      {
        name: 'WAQI (World Air Quality Index Project)',
        url: 'https://waqi.info/',
        description: `Station readings (US AQI) for the map and the air quality tile, shown live and not archived. Data from ${agencies?.full ?? 'the originating monitoring agencies'}, via the World Air Quality Index Project.`,
      },
    ],
  };
}

const BERLIN_SOURCES: SourceGroup[] = [
  {
    category: 'News',
    sources: [
      { name: 'rbb24', url: 'https://www.rbb24.de/', description: 'Regional public broadcaster for Berlin-Brandenburg.' },
      { name: 'Tagesspiegel', url: 'https://www.tagesspiegel.de/', description: 'Major Berlin daily newspaper.' },
      { name: 'Berliner Morgenpost', url: 'https://www.morgenpost.de/', description: 'Berlin daily newspaper.' },
      { name: 'Berliner Zeitung', url: 'https://www.berliner-zeitung.de/', description: 'Berlin daily newspaper.' },
      { name: 'Gründerszene', url: 'https://www.businessinsider.de/gruenderszene/', description: 'Berlin startup and tech news.' },
    ],
  },
  {
    category: 'Safety & Emergency',
    sources: [
      { name: 'Berlin Police', url: 'https://www.berlin.de/polizei/', description: 'Police incident reports via RSS feed.' },
      { name: 'Berliner Feuerwehr Open Data', url: 'https://github.com/Berliner-Feuerwehr/BF-Open-Data', description: 'Monthly fire department statistics — mission counts, EMS and fire response times.' },
      { name: 'Berliner Krisendienst', url: 'https://www.berliner-krisendienst.de/', description: 'Crisis counseling hotlines — 9 regional offices and city-wide emergency numbers.' },
    ],
  },
  {
    category: 'Transit & Traffic',
    sources: [
      { name: 'VBB transport.rest', url: 'https://v6.vbb.transport.rest/', description: 'Real-time public transit disruptions from 12 major Berlin stations.' },
      { name: 'TomTom Traffic', url: 'https://www.tomtom.com/', description: 'Real-time traffic incidents — accidents, closures, road works, congestion.' },
      { name: 'VIZ Berlin', url: 'https://viz.berlin.de/', description: 'Berlin traffic information center — construction sites and road closures. Source: Digitale Plattform Stadtverkehr Berlin, dl-de/by-2-0.' },
    ],
  },
  {
    category: 'Water',
    sources: [
      { name: 'PEGELONLINE (WSV)', url: 'https://www.pegelonline.wsv.de/', description: 'Real-time river water levels from Spree, Havel, and Dahme gauges.' },
      { name: 'LAGeSo Bathing Water', url: 'https://data.lageso.de/', description: 'Water quality measurements for Berlin bathing spots.' },
      { name: 'LAGeSo Wastewater Monitoring', url: 'https://data.lageso.de/', description: 'Weekly viral load measurements (Influenza A/B, RSV) in Berlin wastewater. Source: Lageso Berlin and Berliner Wasserbetriebe, dl-de/by-2-0. City Monitor averages the plants and derives the trend and level.' },
      { name: 'RKI AMELAG Wastewater Surveillance', url: 'https://github.com/robert-koch-institut/Abwassersurveillance_AMELAG', description: 'Weekly SARS-CoV-2 viral load at the Berlin treatment plants. Source: Robert Koch-Institut, CC BY 4.0. City Monitor averages the plants and derives the trend and level.' },
    ],
  },
  {
    category: 'Events',
    sources: [
      { name: 'kulturdaten.berlin', url: 'https://kulturdaten.berlin/', description: 'Cultural events database — concerts, theater, exhibitions.' },
      { name: 'go~mus (State Museums)', url: 'https://www.smb.museum/', description: 'Museum events and guided tours from Berlin State Museums.' },
    ],
  },
  {
    category: 'Social & Economic',
    sources: [
      { name: 'Bundesagentur für Arbeit', url: 'https://statistik.arbeitsagentur.de/', description: 'Monthly unemployment rates, SGB II recipients, and underemployment data.' },
      { name: 'Amt für Statistik Berlin-Brandenburg', url: 'https://www.statistik-berlin-brandenburg.de/', description: 'Semi-annual population register statistics per planning area — population, age groups, foreign residents. Source: Amt für Statistik Berlin-Brandenburg, CC BY. City Monitor derives the shares and the population density.' },
      { name: 'MSS 2025 (Social Atlas)', url: 'https://www.berlin.de/sen/sbw/stadtdaten/stadtwissen/monitoring-soziale-stadtentwicklung/', description: 'Biennial social indicators per planning area — unemployment, poverty, welfare rates.' },
      { name: 'Berlin Budget (Doppelhaushalt)', url: 'https://www.berlin.de/sen/finanzen/', description: 'City budget 2026 — revenues and expenses by district and function category. Licensed CC BY.' },
    ],
  },
  {
    category: 'Civic Services',
    sources: [
      { name: 'service.berlin.de', url: 'https://service.berlin.de/', description: 'Bürgeramt appointment availability for 10 civic services (registration, ID card, passport, etc.).' },
    ],
  },
  {
    category: 'Council Meetings',
    sources: [
      { name: 'ALLRIS OParl (BVV)', url: 'https://oparl.org/', description: 'District assembly meetings from 11 Berlin Bezirke via OParl 1.0 JSON API. Licensed CC BY 3.0 DE.' },
      { name: 'PARDOK (Abgeordnetenhaus)', url: 'https://www.parlament-berlin.de/', description: 'Berlin state parliament committee and plenary schedules via XML feeds.' },
    ],
  },
  {
    category: 'Maps',
    sources: [
      { name: 'Sensor.Community', url: 'https://sensor.community/', description: 'Citizen-run air quality sensors — PM2.5 and PM10 readings. © Sensor.Community contributors, ODbL.' },
      { name: 'Sensor.Community DNMS', url: 'https://sensor.community/en/sensors/dnms/', description: 'Citizen-run noise sensors — LAeq, LAmin, LAmax readings (Berlin only). © Sensor.Community contributors, ODbL.' },
      { name: 'Berlin Open Data (Rent Map)', url: 'https://daten.berlin.de/', description: 'Residential rent zone map (Wohnlagenkarte 2026) as WMS overlay.' },
      { name: 'Berlin Noise Map (SenMVKU)', url: 'https://gdi.berlin.de/services/wms/ua_stratlaerm_2022', description: 'EU strategic noise map 2022 — total, road, rail, and air noise as WMS overlay.' },
    ],
  },
];

const HAMBURG_SOURCES: SourceGroup[] = [
  {
    category: 'Maps',
    sources: [
      { name: 'Hamburg Noise Map (Geodienste)', url: 'https://geodienste.hamburg.de/wms_strategische_laermkarten', description: 'EU strategic noise map — road, rail, and air noise as WMS overlay. Licensed dl-de/zero-2-0.' },
    ],
  },
  {
    category: 'News',
    sources: [
      { name: 'NDR Hamburg', url: 'https://www.ndr.de/nachrichten/hamburg/', description: 'Regional public broadcaster for Northern Germany.' },
      { name: 'MOPO', url: 'https://www.mopo.de/', description: 'Hamburg daily newspaper.' },
      { name: 'Feuerwehr Hamburg (Presseportal)', url: 'https://www.presseportal.de/blaulicht/nr/82522', description: 'Hamburg fire brigade press releases.' },
    ],
  },
  {
    category: 'Safety',
    sources: [
      { name: 'Hamburg Police (Presseportal)', url: 'https://www.presseportal.de/blaulicht/nr/6337', description: 'Hamburg police press releases.' },
      { name: 'Hamburgisches Krisentelefon', url: 'https://www.hamburg.de/politik-und-verwaltung/bezirke/altona/themen/gesundheit/krisentelefon-61202', description: 'Crisis line for acute psychological crises (evenings, nights, weekends) and nationwide hotlines in the Crisis Services tile.' },
    ],
  },
  {
    category: 'Transit & Traffic',
    sources: [
      { name: 'TomTom Traffic', url: 'https://www.tomtom.com/', description: 'Real-time traffic incidents — accidents, closures, road works, congestion.' },
      { name: 'Baustellen Hamburg (Bauweiser)', url: 'https://api.hamburg.de/datasets/v1/baustellen', description: 'Construction sites on main roads and federal highways, with their traffic impact and construction period. Source: Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende, dl-de/by-2-0. City Monitor shows the sites running now or starting within two weeks and shortens long descriptions.' },
    ],
  },
  {
    category: 'Water',
    sources: [
      { name: 'PEGELONLINE (WSV)', url: 'https://www.pegelonline.wsv.de/', description: 'Real-time tidal water levels from Elbe gauges (St. Pauli, Bunthaus, Seemannshöft).' },
    ],
  },
];

const KOELN_SOURCES: SourceGroup[] = [
  {
    category: 'News',
    sources: [
      { name: 'WDR Rheinland', url: 'https://www1.wdr.de/nrw/rheinland/', description: 'Regional public broadcaster for North Rhine-Westphalia, Rheinland edition.' },
      { name: 'Kölner Stadt-Anzeiger', url: 'https://www.ksta.de/koeln/', description: 'Köln daily newspaper.' },
      { name: 'EXPRESS', url: 'https://www.express.de/koeln/', description: 'Köln tabloid newspaper.' },
      { name: 'Stadt Köln', url: 'https://www.stadt-koeln.de/politik-und-verwaltung/presseservice/', description: 'Press releases of the City of Köln.' },
    ],
  },
  {
    category: 'Safety',
    sources: [
      { name: 'Köln Police (Presseportal)', url: 'https://www.presseportal.de/blaulicht/nr/12415', description: 'Köln and Leverkusen police press releases.' },
      { name: 'Sozialpsychiatrischer Dienst Köln', url: 'https://www.stadt-koeln.de/service/adressen/sozialpsychiatrischer-dienst', description: 'The health department\'s social psychiatric service (office hours) and nationwide hotlines in the Crisis Services tile.' },
    ],
  },
  {
    category: 'Transit & Traffic',
    sources: [
      { name: 'TomTom Traffic', url: 'https://www.tomtom.com/', description: 'Real-time traffic incidents — accidents, closures, road works, congestion.' },
      { name: 'Baustellen Köln (Offene Daten Köln)', url: 'https://www.offenedaten-koeln.de/dataset/baustellen-koeln', description: 'Permitted roadworks on city streets — road, utility, sewer, traffic-light, bridge, track and emergency works. The dates are the permit period, which the works need not fill. Source: Stadt Köln, dl-de/zero-2-0.' },
    ],
  },
  {
    category: 'Water',
    sources: [
      { name: 'PEGELONLINE (WSV)', url: 'https://www.pegelonline.wsv.de/', description: 'Real-time Rhine water level from the Köln gauge.' },
    ],
  },
  {
    category: 'Events',
    sources: [
      { name: 'Stadt Köln Open Data (Events)', url: 'https://www.offenedaten-koeln.de/dataset/veranstaltungen-der-stadt-koeln', description: 'Events the City of Cologne runs itself — libraries, museums, the town hall. Licensed dl-de/zero-2-0.' },
    ],
  },
  {
    category: 'Council Meetings',
    sources: [
      { name: 'Stadt Köln SessionNet (OParl)', url: 'https://buergerinfo.stadt-koeln.de/', description: 'Meetings of the city council, its committees and the nine Bezirksvertretungen via the OParl 1.1 API. Official public records; the API states no licence.' },
    ],
  },
  {
    category: 'Politics',
    sources: [
      { name: 'Stadt Köln (Oberbürgermeister, Bezirksvertretungen)', url: 'https://www.stadt-koeln.de/politik-und-verwaltung/bezirksvertretungen/', description: 'The Oberbürgermeister and the nine Bezirksbürgermeister, copied by hand from the city\'s pages and checked twice a year.' },
    ],
  },
  {
    category: 'Maps',
    sources: [
      { name: 'Stadtbezirke Köln (Offene Daten Köln)', url: 'https://www.offenedaten-koeln.de/dataset/stadtbezirke-koeln', description: 'Outlines of the nine Stadtbezirke on the map, converted to WGS84 and simplified. Source: Stadt Köln, dl-de/zero-2-0.' },
    ],
  },
];

// No river level: the Isar through München is not a federal waterway, so not on
// PEGELONLINE; its flood class comes from the LHP.
const MUENCHEN_SOURCES: SourceGroup[] = [
  {
    category: 'News',
    sources: [
      { name: 'BR24 Oberbayern', url: 'https://www.br.de/nachrichten/themen/oberbayern,UZlJdUE', description: 'Regional public broadcaster for Bavaria, Oberbayern edition.' },
      { name: 'Feuerwehr München (Presseportal)', url: 'https://www.presseportal.de/blaulicht/nr/131419', description: 'München fire brigade press releases.' },
    ],
  },
  {
    category: 'Safety',
    sources: [
      { name: 'Krisendienst Psychiatrie Oberbayern', url: 'https://www.bezirk-oberbayern.de/Soziales/Psychiatrie/Krisendienst-Psychiatrie', description: '24/7 psychiatric crisis line and nationwide hotlines in the Crisis Services tile.' },
    ],
  },
  {
    category: 'Transit & Traffic',
    sources: [
      { name: 'TomTom Traffic', url: 'https://www.tomtom.com/', description: 'Real-time traffic incidents — accidents, closures, road works, congestion.' },
      { name: 'Baustellen München (Geoportal)', url: 'https://opendata.muenchen.de/dataset/baustellen_4_weeks_opendata', description: 'Construction works that narrow or close the carriageway, from the city\'s roadworks service map. Source: Landeshauptstadt München – opendata.muenchen.de, dl-de/by-2-0. City Monitor shows each site as a point at the middle of its area.' },
    ],
  },
  {
    category: 'Water',
    sources: [
      { name: 'Länderübergreifendes Hochwasserportal (LHP)', url: 'https://www.hochwasserzentralen.de/', description: 'Flood class (Meldestufe) of the Isar gauges München and Puppling, set by the Bavarian flood warning service, and active flood warnings for München, via the LHP public API. Unchecked raw data; no water levels. Source: Länderübergreifendes Hochwasserportal (LHP), CC BY 4.0.' },
    ],
  },
  {
    category: 'Council Meetings',
    sources: [
      { name: 'München RIS', url: 'https://risi.muenchen.de/', description: 'Stadtrat committee and Bezirksausschuss meetings from the council information system’s RSS feeds. Official public records; the feeds state no licence.' },
    ],
  },
  {
    category: 'Politics',
    sources: [
      { name: 'Landeshauptstadt München (Oberbürgermeister)', url: 'https://stadt.muenchen.de/infos/oberbuergermeister.html', description: 'The Oberbürgermeister, copied by hand from the city\'s page and checked twice a year.' },
    ],
  },
  {
    category: 'Maps',
    sources: [
      { name: 'Stadtbezirke München (GeodatenService)', url: 'https://opendata.muenchen.de/dataset/vablock_stadtbezirke_opendata', description: 'Outlines of the 25 Stadtbezirke on the map; the two parts of Untergiesing-Harlaching and of Thalkirchen-Obersendling-Forstenried-Fürstenried-Solln merged and the lines simplified. Source: Landeshauptstadt München – GeodatenService, dl-de/by-2-0.' },
    ],
  },
];

const CITY_SOURCES: Record<string, SourceGroup[]> = {
  berlin: BERLIN_SOURCES,
  hamburg: HAMBURG_SOURCES,
  koeln: KOELN_SOURCES,
  muenchen: MUENCHEN_SOURCES,
};

function mergeGroups(shared: SourceGroup[], city: SourceGroup[]): SourceGroup[] {
  const merged = new Map<string, Source[]>();

  for (const group of shared) {
    merged.set(group.category, [...group.sources]);
  }
  for (const group of city) {
    const existing = merged.get(group.category);
    if (existing) {
      existing.push(...group.sources);
    } else {
      merged.set(group.category, [...group.sources]);
    }
  }

  return Array.from(merged.entries()).map(([category, sources]) => ({
    category,
    sources,
  }));
}

/** The groups with only the sources credited for `city`, leaving out a group that has none. */
function forCity(groups: SourceGroup[], city: WebCityConfig): SourceGroup[] {
  const hasAny = (required: CityFeature | readonly CityFeature[]) =>
    (typeof required === 'string' ? [required] : required).some((f) => city.features.includes(f));
  const credited = (s: Source) => (!s.cities || s.cities.includes(city.id)) && (!s.requires || hasAny(s.requires));
  return groups
    .map((group) => ({ ...group, sources: group.sources.filter(credited) }))
    .filter((group) => group.sources.length > 0);
}

export function SourcesPage() {
  const city = useCityConfig();
  const { t } = useTranslation();
  const citySources = CITY_SOURCES[city.id] ?? [];
  const groups = forCity(
    mergeGroups([...SHARED_SOURCES, aiProcessingGroup(t)], [waqiGroup(city.id), ...citySources]),
    city,
  );

  const sourceCount = groups.reduce((n, g) => n + g.sources.length, 0);

  // Reached from the footer of a scrolled dashboard: open at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [city.id]);

  useEffect(() => {
    document.title = `Data Sources — City Monitor ${city.name}`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', `All data sources used by City Monitor for ${city.name}. Open data from ${sourceCount}+ sources.`);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', `Data Sources — City Monitor ${city.name}`);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', `All data sources used by City Monitor for ${city.name}.`);
  }, [city.name, sourceCount]);

  return (
    <PageShell
      besideTitle={<CitySwitcher cities={getAllCities()} placement="page-header" hideWhenAlone className="relative" />}
    >
      <article className="space-y-10">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Data Sources — {city.name}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400 text-base">
            City Monitor aggregates publicly available data from{' '}
            <strong className="text-gray-900 dark:text-gray-100">
              {sourceCount} sources
            </strong>.
            All data is fetched server-side — your browser never contacts these services directly
            (except for map tiles).
          </p>
        </header>

        {groups.map((group) => (
          <section key={group.category} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">{group.category}</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-muted">
                {group.sources.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.sources.map((source) => (
                <div
                  key={source.name}
                  className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm"
                >
                  <a
                    href={safeUrl(source.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-link hover:underline"
                  >
                    {source.name}
                  </a>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                    {source.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </article>
    </PageShell>
  );
}
