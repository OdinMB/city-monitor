/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CityConfig } from '@city-monitor/shared';

export const berlin: CityConfig = {
  id: 'berlin',
  name: 'Berlin',
  country: 'DE',
  coordinates: { lat: 52.52, lon: 13.405 },
  boundingBox: { north: 52.68, south: 52.34, east: 13.76, west: 13.09 },
  timezone: 'Europe/Berlin',
  languages: ['de', 'en'],
  map: {
    center: [13.405, 52.52],
    zoom: 11,
    minZoom: 9,
    maxZoom: 17,
    bounds: [
      [12.9, 52.3],
      [13.8, 52.7],
    ],
  },
  theme: { accent: '#E2001A' },
  feeds: [
    { name: 'rbb24', url: 'https://www.rbb24.de/aktuell/index.xml/feed=rbb24.xml', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'Tagesspiegel', url: 'https://www.tagesspiegel.de/contentexport/feed/home', tier: 1, type: 'mainstream', lang: 'de' },
    { name: 'Berliner Morgenpost', url: 'https://www.morgenpost.de/berlin/rss', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'BZ Berlin', url: 'https://www.bz-berlin.de/feed', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'Berlin.de News', url: 'https://www.berlin.de/news/rss/all.rss', tier: 1, type: 'gov', lang: 'de' },
    { name: 'Berliner Zeitung', url: 'https://www.berliner-zeitung.de/feed.xml', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'taz Berlin', url: 'https://taz.de/Berlin/!p4610;rss/', tier: 2, type: 'mainstream', lang: 'de' },
    { name: 'RBB Polizei', url: 'https://www.berlin.de/polizei/polizeimeldungen/index.php/rss', tier: 1, type: 'gov', lang: 'de', category: 'crime' },
    { name: 'Gründerszene Berlin', url: 'https://www.businessinsider.de/gruenderszene/feed/', tier: 3, type: 'tech', lang: 'de' },
    { name: 'Exberliner', url: 'https://www.exberliner.com/feed/', tier: 3, type: 'other', lang: 'en' },
  ],
  dataSources: {
    weather: { provider: 'open-meteo', lat: 52.52, lon: 13.405 },
    transit: {
      provider: 'hafas',
      operatorId: 'VBB',
      endpoint: 'https://v6.vbb.transport.rest',
      stations: [
        { id: '900100003', name: 'Alexanderplatz' },
        { id: '900003201', name: 'Hauptbahnhof' },
        { id: '900120005', name: 'Zoologischer Garten' },
        { id: '900100001', name: 'Friedrichstraße' },
        { id: '900007102', name: 'Gesundbrunnen' },
        { id: '900120004', name: 'Ostkreuz' },
        { id: '900058101', name: 'Südkreuz' },
        { id: '900024101', name: 'Westkreuz' },
        { id: '900013101', name: 'Nollendorfplatz' },
        { id: '900017101', name: 'Mehringdamm' },
        { id: '900013102', name: 'Hermannplatz' },
        { id: '900029101', name: 'Spandau' },
      ],
    },
    events: { provider: 'api', url: 'https://api-v2.kulturdaten.berlin/api/events' },
    police: { provider: 'rss', url: 'https://www.berlin.de/polizei/polizeimeldungen/index.php/rss' },
  },
};
