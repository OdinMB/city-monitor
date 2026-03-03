/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ReactNode } from 'react';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { TopBar } from './TopBar.js';
import { Footer } from './Footer.js';

export function Shell({ children }: { children: ReactNode }) {
  const city = useCityConfig();
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <TopBar />
      <main className="flex-1">
        <h1 className="sr-only">City Monitor — {city.name}</h1>
        {children}
      </main>
      <Footer />
    </div>
  );
}
