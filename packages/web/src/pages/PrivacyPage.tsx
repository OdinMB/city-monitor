/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { PageShell } from '../components/layout/PageShell.js';
import { ObfuscatedEmail } from '../components/ObfuscatedContact.js';

const SERVICES = [
  {
    name: 'Simple Analytics',
    url: 'https://www.simpleanalytics.com/',
    purpose: 'Privacy-friendly analytics',
    data: 'Counts page views without cookies, personal data, or tracking. EU-based and GDPR compliant by design. No data is shared with third parties.',
  },
  {
    name: 'Render',
    url: 'https://render.com/',
    purpose: 'Website hosting',
    data: 'Standard HTTP data (IP address, user agent) as part of hosting infrastructure.',
  },
  {
    name: 'CARTO',
    url: 'https://carto.com/',
    purpose: 'Base map tiles',
    data: 'Your browser loads map tiles directly from CARTO servers, exposing your IP address to them.',
  },
];

export function PrivacyPage() {
  return (
    <PageShell>
      <Helmet>
        <title>Privacy Policy — City Monitor</title>
        <meta name="description" content="Privacy policy for City Monitor. No cookies, no user tracking, privacy-friendly analytics." />
        <meta property="og:title" content="Privacy Policy — City Monitor" />
        <meta property="og:description" content="Privacy policy for City Monitor. No cookies, no user tracking, privacy-friendly analytics." />
      </Helmet>

      <article className="space-y-10">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400 text-base">
            We do not use cookies, tracking pixels, advertising scripts, or any other data
            collection that identifies you. When you visit this site, nothing is stored on your
            device except two preferences you control.
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
                <a href="https://www.simpleanalytics.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                  Simple Analytics
                </a>
                , a privacy-friendly, EU-based analytics service. It counts page views without
                cookies, without personal data, and without tracking you across sites. We see
                aggregate numbers — never individual visitors.
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
            We store exactly two values in <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono">localStorage</code>, both under your control:
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
              <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mb-1">theme</p>
              <p className="text-sm font-medium">Theme preference</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">&quot;light&quot; or &quot;dark&quot; — persists your color scheme.</p>
            </div>
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
              <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mb-1">language</p>
              <p className="text-sm font-medium">Language preference</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">e.g. &quot;en&quot;, &quot;de&quot; — keeps the interface in your language.</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            These values never leave your browser. They are not sent to our servers or any third party.
            You can clear them at any time in your browser settings.
          </p>
        </section>

        {/* Third-Party Services */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Third-Party Services</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800/60 text-left">
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
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                          {s.name}
                        </a>
                      ) : s.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.purpose}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            See our <Link to="/berlin/sources" className="text-blue-600 dark:text-blue-400 hover:underline">data sources</Link> page for a full list of APIs we use.
            All fonts are self-hosted. We do not load fonts, scripts, or other resources from external CDNs.
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
              <ObfuscatedEmail className="text-blue-600 dark:text-blue-400 hover:underline" />.
            </p>
          </div>
        </section>
      </article>
    </PageShell>
  );
}
