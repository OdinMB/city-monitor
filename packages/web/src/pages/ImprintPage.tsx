/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { PageShell } from '../components/layout/PageShell.js';
import { ObfuscatedEmail, ObfuscatedAddress } from '../components/ObfuscatedContact.js';

const LINK_CLASS = 'text-blue-600 dark:text-blue-400 hover:underline';

export function ImprintPage() {
  return (
    <PageShell>
      <Helmet>
        <title>Legal Notice / Impressum — City Monitor</title>
        <meta name="description" content="Legal notice and contact information for City Monitor." />
        <meta property="og:title" content="Legal Notice / Impressum — City Monitor" />
        <meta property="og:description" content="Legal notice and contact information for City Monitor." />
      </Helmet>

      <article className="space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Legal Notice / Impressum</h1>

        {/* Profile card */}
        <aside className="flex items-center gap-5 p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <img
            src="https://github.com/OdinMB.png"
            alt="Odin Mühlenbein"
            width={72}
            height={72}
            className="rounded-full shrink-0 ring-2 ring-gray-200 dark:ring-gray-700"
          />
          <div>
            <p className="font-semibold text-base">Odin Mühlenbein</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">AI Tinkerer</p>
            <div className="flex gap-3 mt-1.5">
              <a
                href="https://odins.website"
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm ${LINK_CLASS}`}
              >
                Website
              </a>
              <a
                href="https://www.linkedin.com/in/odinmuehlenbein/"
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm ${LINK_CLASS}`}
              >
                LinkedIn
              </a>
            </div>
          </div>
        </aside>

        {/* Legal sections */}
        <div className="grid gap-6 sm:grid-cols-2">
          <section className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Information (§ 5 DDG)
            </h2>
            <ObfuscatedAddress />
            <p className="text-sm mt-3">
              <ObfuscatedEmail className={LINK_CLASS} />
            </p>
          </section>

          <section className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Editorially Responsible (§ 18 Abs. 2 MStV)
            </h2>
            <ObfuscatedAddress />
          </section>
        </div>

        {/* Privacy link */}
        <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <Link
            to="/privacy"
            className={`inline-flex items-center gap-1.5 ${LINK_CLASS}`}
          >
            Privacy Policy &mdash; you will be pleasantly surprised
          </Link>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
          <span>
            Open source under the{' '}
            <a
              href="https://github.com/OdinMB/city-monitor/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              GNU AGPL v3
            </a>
          </span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/OdinMB/city-monitor"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            View on GitHub
          </a>
        </div>
      </article>
    </PageShell>
  );
}
