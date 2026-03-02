/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createEventsIngestion, type CityEvent } from './ingest-events.js';

const mockEventsFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Berlin Events</title>
    <item>
      <title>Berliner Philharmoniker – Konzert</title>
      <link>https://www.berlin.de/events/1</link>
      <pubDate>${new Date(Date.now() + 86400000).toUTCString()}</pubDate>
      <description>Ein Konzert der Berliner Philharmoniker in der Philharmonie.</description>
    </item>
    <item>
      <title>Markthalle Neun – Street Food Thursday</title>
      <link>https://www.berlin.de/events/2</link>
      <pubDate>${new Date(Date.now() + 2 * 86400000).toUTCString()}</pubDate>
      <description>Wöchentlicher Street Food Markt.</description>
    </item>
  </channel>
</rss>`;

describe('ingest-events', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips ingestion when no events source is configured', async () => {
    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest();

    const events = cache.get<CityEvent[]>('berlin:events:upcoming');
    expect(events).toBeNull();
  });

  // Events ingestion is a placeholder until a Berlin events source is configured.
  // Fetch failure tests will be added when the real implementation lands.
});
