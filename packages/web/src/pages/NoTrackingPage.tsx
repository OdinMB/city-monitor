/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { PageShell } from '../components/layout/PageShell.js';

const CHECK = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 inline-block shrink-0" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CROSS = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 inline-block shrink-0" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ROWS = [
  { label: 'Ads', ours: 'None', theirs: 'Display, native, and sponsored' },
  { label: 'Tracking', ours: 'None (cookie-free analytics)', theirs: 'Analytics, cookies, third-party trackers' },
  { label: 'Cookies', ours: 'None', theirs: 'Session, analytics, and ad cookies' },
  { label: 'Funding', ours: 'Donations', theirs: 'Advertising / government budgets' },
  { label: 'Source code', ours: 'Open (AGPL-3.0)', theirs: 'Proprietary' },
];

const CARDS = [
  { title: 'No Ads', icon: '🚫', body: 'Not now, not ever. No display ads, sponsored content, or "recommended" links.' },
  { title: 'No Tracking', icon: '👤', body: "No cookies, no pixels, no fingerprinting. We use Simple Analytics for privacy-friendly page views — they don't track you either." },
  { title: 'No Cookies', icon: '🍪', body: 'Zero cookies. Two preferences (theme & language) live in localStorage only.' },
  { title: 'No Paywalls', icon: '🔓', body: 'Everything is free. The dashboard, the API, the source code. No premium tiers.' },
];

export function NoTrackingPage() {
  return (
    <PageShell>
      <Helmet>
        <title>No Ads, No Tracking — City Monitor</title>
        <meta name="description" content="City Monitor is free, open source, and respects your privacy. No ads, no tracking, no cookies." />
        <meta property="og:title" content="No Ads, No Tracking — City Monitor" />
        <meta property="og:description" content="City Monitor is free, open source, and respects your privacy. No ads, no tracking, no cookies." />
      </Helmet>

      <article className="space-y-10">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            No Ads. No Tracking. No Cookies.
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400 text-base">
            Most free web services make money from your data. City Monitor is different.
          </p>
        </header>

        {/* Comparison table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800/60 text-left">
                <th className="px-4 py-3 font-semibold" />
                <th className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">City Monitor</th>
                <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Typical dashboard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {ROWS.map((r) => (
                <tr key={r.label} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{r.label}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      {CHECK} {r.ours}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5">
                      {CROSS} {r.theirs}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Feature cards */}
        <section>
          <h2 className="text-xl font-bold mb-4">What We Don&apos;t Do</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CARDS.map((c) => (
              <div
                key={c.title}
                className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-2xl mb-2" aria-hidden="true">{c.icon}</div>
                <p className="font-semibold mb-1">{c.title}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            For details on what data we collect (or rather don&apos;t collect), see our{' '}
            <Link to="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
              privacy policy
            </Link>.
          </p>
        </div>

        {/* CTA */}
        <div className="rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800/50 dark:to-gray-900 border border-gray-200 dark:border-gray-800 text-center px-6 py-10">
          <h2 className="text-xl font-bold mb-2">How We Stay Free</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 max-w-sm mx-auto">
            Free. Open source. Without ads. Help us keep it that way.
          </p>
          <a
            href="https://ko-fi.com/OdinMB"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-2.5 text-sm font-semibold rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition-opacity shadow-sm"
          >
            Support Us
          </a>
        </div>
      </article>
    </PageShell>
  );
}
