import { Fragment } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { getAllCities } from '../config/index.js';
import { PageShell } from '../components/layout/PageShell.js';
import { ObfuscatedEmail } from '../components/ObfuscatedContact.js';

interface Service {
  name: string;
  url?: string;
  /** Third-party hosts the visitor's browser contacts for this service. */
  hosts: string[];
  purpose: string;
  data: string;
}

// Every third-party host the browser contacts must be named here. The deployed
// Content-Security-Policy (render.yaml) and index.html are checked against
// this list in PrivacyPage.test.tsx.
const SERVICES: Service[] = [
  {
    name: 'Simple Analytics',
    url: 'https://www.simpleanalytics.com/',
    hosts: ['scripts.simpleanalyticscdn.com', 'queue.simpleanalyticscdn.com'],
    purpose: 'Privacy-friendly analytics',
    data: 'Your browser loads the analytics script and reports page views directly to Simple Analytics servers, which receive your IP address, as with any web request. Simple Analytics says it counts page views without cookies and without storing IP addresses or other personal data. According to Simple Analytics, it is EU-based, GDPR compliant by design, and shares no data with third parties.',
  },
  {
    name: 'Render',
    url: 'https://render.com/',
    hosts: [],
    purpose: 'Website hosting',
    data: 'Standard HTTP data (IP address, user agent) as part of hosting infrastructure.',
  },
  {
    name: 'CARTO',
    url: 'https://carto.com/',
    hosts: ['basemaps.cartocdn.com', '*.basemaps.cartocdn.com'],
    purpose: 'Base map',
    data: 'Your browser loads the map style, map tiles, and the fonts for map labels directly from CARTO servers, exposing your IP address to them.',
  },
  {
    name: 'City geodata services',
    hosts: ['gdi.berlin.de', 'geodienste.hamburg.de', 'www.wms.nrw.de', 'geoportal.stadt-koeln.de'],
    purpose: 'Noise, rent, traffic-flow map and street tree layers',
    data: "Only while the noise map, the rent map, the live traffic-flow map or the street tree layer is switched on, your browser loads those map images directly from the official geodata service of the city or its state, exposing your IP address to it. When you click a tree, your browser asks the city's service for that tree's details, which tells it the map position you clicked.",
  },
];

// Exactly the localStorage keys the app reads or writes; PrivacyPage.test.tsx
// scans the web source for keys and fails when the two lists differ.
const STORED_VALUES = [
  {
    key: 'theme',
    title: 'Theme preference',
    description: '"light" or "dark" — persists your color scheme.',
  },
  {
    key: 'language',
    title: 'Language preference',
    description: 'e.g. "en", "de" — keeps the interface in your language.',
  },
  {
    key: 'nina-dismissed',
    title: 'Dismissed warnings',
    description: 'The IDs and versions of official warnings you closed, so they stay hidden until they are updated. Each is removed the next time the page loads the warnings after its warning has ended or been updated.',
  },
  {
    key: 'cm-drawer-seen',
    title: 'Map layer tip',
    description: 'Set once you open the map layer panel on a small screen, so its button stops pulsing.',
  },
  {
    key: 'hasSeenKeyboardHints',
    title: 'Keyboard shortcuts tip',
    description: 'Set once the keyboard shortcuts tip has been shown, so it appears only once.',
  },
  {
    key: 'keyboard-shortcuts',
    title: 'Single-key shortcuts setting',
    description: '"off" or "on" — set only when you switch the single-key shortcuts off (or back on), so the choice stays.',
  },
  {
    key: 'hht-preview',
    title: 'Preview token',
    description: 'Set only when you open a review link we gave a partner (with "?preview=" in it): the token that shows events not yet public. Kept in sessionStorage, so it is gone when you close the tab.',
  },
];

// The one cookie the app sets (lib/setup-cookie.ts); the same scan finds its name.
const STORED_COOKIES = [
  {
    key: 'cm_setup',
    title: 'Dashboard layout and map settings (cookie)',
    description: 'Set only once you change something: per city, the setup you chose (one of the ready-made setups such as Everyday or Commute, or one of up to three of your own, with the names you gave them and their sections), the sections you collapsed, and the map layers and options of each setup: for each of your own setups the map you gave it, and for a ready-made setup only what you changed in its map, with when you changed it, so that the oldest such changes can be dropped first when the cookie runs out of room. A first-party cookie, kept for one year. Your browser sends it along when it loads this site’s pages, as with any cookie, but nothing on our side reads it: the dashboard reads it in your browser. It never goes to our data API or to any third party.',
  },
];

export function PrivacyPage() {
  return (
    <PageShell>
      <Helmet>
        <title>Privacy Policy — City Monitor</title>
        <meta name="description" content="Privacy policy for City Monitor. No tracking cookies, no user tracking, privacy-friendly analytics." />
        <meta property="og:title" content="Privacy Policy — City Monitor" />
        <meta property="og:description" content="Privacy policy for City Monitor. No tracking cookies, no user tracking, privacy-friendly analytics." />
      </Helmet>

      <article className="space-y-10">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400 text-base">
            We do not use tracking or advertising cookies, tracking pixels, advertising scripts, or
            any other data collection that identifies you. When you visit this site, nothing is
            stored on your device except your theme, language and keyboard shortcut settings, three
            small flags that remember which warnings you dismissed and which tips you have already
            seen, once you change the dashboard&apos;s tile layout or map, one first-party cookie
            that remembers those display preferences, and, only if you open a partner&apos;s review
            link, a preview token for that tab.
          </p>
        </header>

        {/* What We Collect */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">What We Collect</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <h3 className="font-semibold mb-1">Website Analytics</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                We use{' '}
                <a href="https://www.simpleanalytics.com/" target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                  Simple Analytics
                </a>
                , a privacy-friendly analytics service. According to Simple Analytics, it is
                EU-based and counts page views without cookies, without storing personal data, and
                without tracking you across sites. We see aggregate numbers — never individual visitors.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
              <h3 className="font-semibold mb-1">Server Logs</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Our server records basic request metadata (URL path, HTTP status, response time) for
                operational monitoring. Retained for 14 days, then deleted. IP addresses are not logged.
              </p>
            </div>
          </div>
        </section>

        {/* Local Storage */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">What We Store on Your Device</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We store these values in <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono">localStorage</code>, and the last one in a cookie, all under your control:
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[...STORED_VALUES, ...STORED_COOKIES].map((v) => (
              <div key={v.key} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                <p className="text-xs font-mono text-muted mb-1">{v.key}</p>
                <p className="text-sm font-medium">{v.title}</p>
                <p className="text-xs text-muted mt-0.5">{v.description}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            None of these values identifies you, and none is sent to any third party. Our server sees
            only two: your language, which the dashboard includes when it asks for the daily
            briefing, so the briefing comes back in your language; and a preview token, if you have
            one, which the dashboard sends with its requests for events. You can clear them at any
            time in your browser settings.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The dashboard&apos;s &ldquo;Share this view&rdquo; puts the tile layout on screen and your
            map settings, the layout&apos;s name and section names included, into the address of
            the link it copies, so whoever opens that link sees them. Opening a shared link changes
            nothing stored on your device unless you choose to keep its layout.
          </p>
        </section>

        {/* Third-Party Services */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Third-Party Services</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800/60 text-start">
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                  <th className="px-4 py-3 font-semibold">Data Shared</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {SERVICES.map((s) => (
                  <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors align-top">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                          {s.name}
                        </a>
                      ) : s.name}
                      {s.hosts.map((host) => (
                        <span key={host} className="block mt-1 text-xs font-mono font-normal text-muted">
                          {host}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.purpose}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Each city&apos;s data sources page lists the APIs we use for it:{' '}
            {getAllCities().map((city, i) => (
              <Fragment key={city.id}>
                {i > 0 && ', '}
                <Link to={`/${city.id}/sources`} className="text-link hover:underline">{city.name}</Link>
              </Fragment>
            ))}.
            Everything else on the dashboard, including the rain radar, comes through our own server,
            so those data providers never receive requests from your browser when the dashboard loads
            its data. The interface uses your
            device&apos;s built-in fonts. Apart from the services listed above, we do not load fonts,
            scripts, or other resources from external servers.
          </p>
        </section>

        {/* GDPR Rights */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Your Rights</h2>
          <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Under GDPR and similar regulations, you have the right to:
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 text-sm">
              {[
                'Request access to any personal data we hold',
                'Request correction or deletion of your data',
                'Object to data processing',
                'Lodge a complaint with a supervisory authority',
              ].map((right) => (
                <li key={right} className="flex items-start gap-2">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0 mt-0.5" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300">{right}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Since we collect no personal data, there is nothing for us to provide. We do not know
              who you are, and that is by design.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              For any privacy-related questions, contact us at{' '}
              <ObfuscatedEmail className="text-link hover:underline" />.
            </p>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
