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
    airQuality: {
      sensorCommunityStations: [
        { sensorId: 25905, name: 'Spandau' },
        { sensorId: 5040, name: 'Reinickendorf' },
        { sensorId: 57233, name: 'Tegel' },
        { sensorId: 23322, name: 'Marzahn-Hellersdorf' },
        { sensorId: 9409, name: 'Marzahn-Nord' },
        { sensorId: 7051, name: 'Treptow-Köpenick' },
        { sensorId: 81508, name: 'Grünau' },
        { sensorId: 1376, name: 'Lichtenberg' },
        { sensorId: 68686, name: 'Hohenschönhausen' },
        { sensorId: 19095, name: 'Charlottenburg' },
        { sensorId: 70607, name: 'Westend' },
        { sensorId: 15536, name: 'Zehlendorf' },
        { sensorId: 3036, name: 'Pankow' },
        { sensorId: 80508, name: 'Französisch Buchholz' },
      ],
    },
    events: [
      { source: 'kulturdaten', url: 'https://api-v2.kulturdaten.berlin/api/events' },
      { source: 'ticketmaster', url: 'https://app.ticketmaster.com/discovery/v2/events.json' },
      { source: 'gomus', url: 'https://smb.gomus.de/api/v4/events' },
    ],
    police: { provider: 'rss', url: 'https://www.berlin.de/polizei/polizeimeldungen/index.php/rss' },
    nina: { ars: '110000000000' },
    roadworks: { url: 'https://api.viz.berlin.de/daten/baustellen_sperrungen.json' },
    waterLevels: {
      provider: 'pegelonline',
      stations: [
        { uuid: '09e15cf6-f155-4b76-b92f-6c260839121c', name: 'Mühlendamm', waterBody: 'Spree' },
        { uuid: 'd89eb759-58c4-43f4-9fe4-e6a21af23f5c', name: 'Charlottenburg', waterBody: 'Spree' },
        { uuid: '47d3e815-c556-4e1b-93de-9fe07329fb00', name: 'Köpenick', waterBody: 'Spree' },
        { uuid: '2c68509c-bf1e-4866-9ec4-b26b231e5e04', name: 'Spandau', waterBody: 'Havel' },
        { uuid: '6b595707-8c47-4bc7-a803-dbc327775c26', name: 'Schmöckwitz', waterBody: 'Dahme' },
      ],
    },
    budget: {
      provider: 'berlin-doppelhaushalt',
      csvUrl: 'https://www.berlin.de/sen/finanzen/service/daten/260223_doppelhaushalt_2026_2027.csv',
    },
    socialAtlas: {
      provider: 'mss-wfs',
      wfsUrl: 'https://gdi.berlin.de/services/wfs/mss_2023',
    },
    appointments: {
      provider: 'service-berlin',
      services: [
        { id: '120686', name: 'Anmeldung' },
        { id: '121482', name: 'Personalausweis' },
        { id: '120335', name: 'Reisepass' },
        { id: '120926', name: 'Führungszeugnis' },
        { id: '120702', name: 'Meldebescheinigung' },
        { id: '120697', name: 'Ummeldung' },
        { id: '121701', name: 'Beglaubigung' },
        { id: '121151', name: 'Kinderreisepass' },
        { id: '121627', name: 'Fahrerlaubnis' },
        { id: '121721', name: 'Bewohnerparkausweis' },
      ],
    },
  },
};
