import { useEffect } from 'react';
import { useCityConfig } from '../hooks/useCityConfig.js';
import { PageShell } from '../components/layout/PageShell.js';

interface Source {
  name: string;
  url: string;
  description: string;
}

interface SourceGroup {
  category: string;
  sources: Source[];
}

const SHARED_SOURCES: SourceGroup[] = [
  {
    category: 'Weather & Environment',
    sources: [
      {
        name: 'Open-Meteo',
        url: 'https://open-meteo.com/',
        description: 'Current weather conditions and 7-day forecast (temperature, humidity, wind, precipitation).',
      },
      {
        name: 'Open-Meteo Air Quality',
        url: 'https://open-meteo.com/en/docs/air-quality-api',
        description: 'European Air Quality Index (AQI), PM2.5, PM10, NO2, and ozone levels.',
      },
      {
        name: 'RainViewer',
        url: 'https://www.rainviewer.com/',
        description: 'Precipitation radar tiles for the rain radar map overlay.',
      },
      {
        name: 'DWD (Deutscher Wetterdienst)',
        url: 'https://www.dwd.de/',
        description: 'Official German severe weather warnings and pollen forecast (Pollenflug-Gefahrenindex).',
      },
      {
        name: 'WAQI (World Air Quality Index)',
        url: 'https://waqi.info/',
        description: 'AQI readings from official monitoring stations.',
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
      },
      {
        name: 'aponet.de',
        url: 'https://www.aponet.de/',
        description: 'On-call emergency pharmacy locations and hours.',
      },
      {
        name: 'OpenStreetMap (Overpass API)',
        url: 'https://overpass-api.de/',
        description: 'Automated external defibrillator (AED) locations from OpenStreetMap.',
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
      },
    ],
  },
  {
    category: 'Politics',
    sources: [
      {
        name: 'abgeordnetenwatch.de',
        url: 'https://www.abgeordnetenwatch.de/',
        description: 'Parliamentary representatives for Bundestag and state parliaments, mapped to city constituencies.',
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
  {
    category: 'AI Processing',
    sources: [
      {
        name: 'OpenAI',
        url: 'https://openai.com/',
        description: 'GPT-5 for news headline classification, geolocation, and daily briefing summarization.',
      },
    ],
  },
];

const BERLIN_SOURCES: SourceGroup[] = [
  {
    category: 'News',
    sources: [
      { name: 'rbb24', url: 'https://www.rbb24.de/', description: 'Regional public broadcaster for Berlin-Brandenburg.' },
      { name: 'Tagesspiegel', url: 'https://www.tagesspiegel.de/', description: 'Major Berlin daily newspaper.' },
      { name: 'Berlin.de', url: 'https://www.berlin.de/news/', description: 'Official Berlin state government news.' },
      { name: 'Berliner Morgenpost', url: 'https://www.morgenpost.de/', description: 'Berlin daily newspaper.' },
      { name: 'BZ Berlin', url: 'https://www.bz-berlin.de/', description: 'Berlin tabloid newspaper.' },
      { name: 'Berliner Zeitung', url: 'https://www.berliner-zeitung.de/', description: 'Berlin daily newspaper.' },
      { name: 'taz Berlin', url: 'https://taz.de/', description: 'Left-leaning national daily, Berlin section.' },
      { name: 'Gründerszene', url: 'https://www.businessinsider.de/gruenderszene/', description: 'Berlin startup and tech news.' },
      { name: 'Exberliner', url: 'https://www.exberliner.com/', description: 'English-language Berlin magazine.' },
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
      { name: 'VIZ Berlin', url: 'https://viz.berlin.de/', description: 'Berlin traffic information center — construction sites and road closures.' },
    ],
  },
  {
    category: 'Water',
    sources: [
      { name: 'PEGELONLINE (WSV)', url: 'https://www.pegelonline.wsv.de/', description: 'Real-time river water levels from Spree, Havel, and Dahme gauges.' },
      { name: 'LAGeSo Bathing Water', url: 'https://data.lageso.de/', description: 'Water quality measurements for Berlin bathing spots.' },
      { name: 'LAGeSo Wastewater Monitoring', url: 'https://data.lageso.de/', description: 'Weekly viral load measurements (Influenza A/B, RSV) in Berlin wastewater.' },
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
      { name: 'MSS 2023 (Social Atlas)', url: 'https://www.berlin.de/sen/sbw/stadtdaten/stadtwissen/monitoring-soziale-stadtentwicklung/', description: 'Biennial social indicators per planning area — unemployment, poverty, welfare rates.' },
      { name: 'Berlin Budget (Doppelhaushalt)', url: 'https://www.berlin.de/sen/finanzen/', description: 'City budget 2026 — revenues and expenses by district and function category.' },
    ],
  },
  {
    category: 'Civic Services',
    sources: [
      { name: 'service.berlin.de', url: 'https://service.berlin.de/', description: 'Bürgeramt appointment availability for 10 civic services (registration, ID card, passport, etc.).' },
    ],
  },
  {
    category: 'Maps',
    sources: [
      { name: 'Sensor.Community', url: 'https://sensor.community/', description: 'Citizen-run air quality sensors — PM2.5 and PM10 readings.' },
      { name: 'Sensor.Community DNMS', url: 'https://sensor.community/en/sensors/dnms/', description: 'Citizen-run noise sensors — LAeq, LAmin, LAmax readings (Berlin only).' },
      { name: 'Berlin Open Data (Rent Map)', url: 'https://daten.berlin.de/', description: 'Residential rent zone map (Wohnlagenkarte 2024) as WMS overlay.' },
      { name: 'Berlin Noise Map (SenMVKU)', url: 'https://gdi.berlin.de/services/wms/ua_stratlaerm_2022', description: 'EU strategic noise map 2022 — total, road, rail, and air noise as WMS overlay.' },
    ],
  },
];

const HAMBURG_SOURCES: SourceGroup[] = [
  {
    category: 'Maps',
    sources: [
      { name: 'Hamburg Noise Map (Geodienste)', url: 'https://geodienste.hamburg.de/wms_strategische_laermkarten', description: 'EU strategic noise map — road, rail, and air noise as WMS overlay.' },
    ],
  },
  {
    category: 'News',
    sources: [
      { name: 'NDR Hamburg', url: 'https://www.ndr.de/nachrichten/hamburg/', description: 'Regional public broadcaster for Northern Germany.' },
      { name: 'Hamburger Abendblatt', url: 'https://www.abendblatt.de/', description: 'Major Hamburg daily newspaper.' },
      { name: 'hamburg.de', url: 'https://www.hamburg.de/', description: 'Official Hamburg state government news.' },
      { name: 'MOPO', url: 'https://www.mopo.de/', description: 'Hamburg daily newspaper.' },
    ],
  },
  {
    category: 'Safety',
    sources: [
      { name: 'Hamburg Police (Presseportal)', url: 'https://www.presseportal.de/', description: 'Hamburg police press releases.' },
    ],
  },
  {
    category: 'Transit & Traffic',
    sources: [
      { name: 'TomTom Traffic', url: 'https://www.tomtom.com/', description: 'Real-time traffic incidents — accidents, closures, road works, congestion.' },
    ],
  },
  {
    category: 'Water',
    sources: [
      { name: 'PEGELONLINE (WSV)', url: 'https://www.pegelonline.wsv.de/', description: 'Real-time tidal water levels from Elbe gauges (St. Pauli, Bunthaus, Seemannshöft).' },
    ],
  },
];

const CITY_SOURCES: Record<string, SourceGroup[]> = {
  berlin: BERLIN_SOURCES,
  hamburg: HAMBURG_SOURCES,
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

export function SourcesPage() {
  const city = useCityConfig();
  const citySources = CITY_SOURCES[city.id] ?? [];
  const groups = mergeGroups(SHARED_SOURCES, citySources);

  const sourceCount = groups.reduce((n, g) => n + g.sources.length, 0);

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
    <PageShell>
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
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
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
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
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
