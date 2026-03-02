/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createSafetyIngestion, type SafetyReport } from './ingest-safety.js';

const mockPoliceFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Polizeimeldungen</title>
    <item>
      <title>Raub in Mitte – Täter flüchtig</title>
      <link>https://www.berlin.de/polizei/polizeimeldungen/1</link>
      <pubDate>Sun, 01 Mar 2026 10:00:00 GMT</pubDate>
      <description>Am Samstag wurde ein Mann beraubt.</description>
    </item>
    <item>
      <title>Verkehrsunfall in Kreuzberg</title>
      <link>https://www.berlin.de/polizei/polizeimeldungen/2</link>
      <pubDate>Sun, 01 Mar 2026 08:00:00 GMT</pubDate>
      <description>Bei einem Unfall wurden zwei Personen verletzt.</description>
    </item>
  </channel>
</rss>`;

describe('ingest-safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches police RSS and writes SafetyReport[] to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockPoliceFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createSafetyIngestion(cache);
    await ingest();

    const reports = cache.get<SafetyReport[]>('berlin:safety:recent');
    expect(reports).toBeTruthy();
    expect(reports!.length).toBe(2);
    expect(reports![0].title).toContain('Raub');
  });

  it('extracts district from title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockPoliceFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createSafetyIngestion(cache);
    await ingest();

    const reports = cache.get<SafetyReport[]>('berlin:safety:recent')!;
    const mitteReport = reports.find((r) => r.title.includes('Mitte'));
    expect(mitteReport?.district).toBe('Mitte');

    const kreuzbergReport = reports.find((r) => r.title.includes('Kreuzberg'));
    expect(kreuzbergReport?.district).toBe('Kreuzberg');
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createSafetyIngestion(cache);
    await ingest(); // should not throw

    const reports = cache.get<SafetyReport[]>('berlin:safety:recent');
    expect(reports).toBeNull();
  });
});
