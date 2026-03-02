/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CityConfig } from '@city-monitor/shared';

export const hamburg: CityConfig = {
  id: 'hamburg',
  name: 'Hamburg',
  country: 'DE',
  coordinates: { lat: 53.5511, lon: 9.9937 },
  boundingBox: { north: 53.74, south: 53.39, east: 10.33, west: 9.73 },
  timezone: 'Europe/Berlin',
  languages: ['de', 'en'],
  map: {
    center: [9.9937, 53.5511],
    zoom: 11,
    minZoom: 9,
    maxZoom: 17,
    bounds: [
      [9.7, 53.35],
      [10.35, 53.75],
    ],
  },
  theme: { accent: '#004B93' },
  feeds: [
    { name: 'NDR Hamburg', url: 'https://www.ndr.de/nachrichten/hamburg/index-rss.xml', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'Hamburger Abendblatt', url: 'https://www.abendblatt.de/hamburg/rss', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'MOPO', url: 'https://www.mopo.de/feed/', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'hamburg.de News', url: 'https://www.hamburg.de/rss/aktuelles/', tier: 1, type: 'gov', lang: 'de' },
  ],
  dataSources: {
    weather: { provider: 'open-meteo', lat: 53.5511, lon: 9.9937 },
    // HVV transport.rest API is deprecated and offline (March 2026) — no free alternative
    police: { provider: 'rss', url: 'https://www.presseportal.de/rss/dienststelle_6013.rss2' },
  },
};
