/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { CK } from './cache-keys.js';

describe('CK (cache keys)', () => {
  it('weather key', () => {
    expect(CK.weather('berlin')).toBe('berlin:weather');
  });

  it('air quality keys', () => {
    expect(CK.airQuality('berlin')).toBe('berlin:air-quality');
    expect(CK.airQualityGrid('berlin')).toBe('berlin:air-quality:grid');
    expect(CK.airQualityScCache('berlin')).toBe('berlin:air-quality:sc-cache');
  });

  it('transit and traffic keys', () => {
    expect(CK.transitAlerts('berlin')).toBe('berlin:transit:alerts');
    expect(CK.trafficIncidents('hamburg')).toBe('hamburg:traffic:incidents');
  });

  it('news keys', () => {
    expect(CK.newsDigest('berlin')).toBe('berlin:news:digest');
    expect(CK.newsCategory('berlin', 'transit')).toBe('berlin:news:transit');
    expect(CK.newsSummary('berlin')).toBe('berlin:news:summary');
  });

  it('events and safety keys', () => {
    expect(CK.eventsUpcoming('berlin')).toBe('berlin:events:upcoming');
    expect(CK.safetyRecent('berlin')).toBe('berlin:safety:recent');
    expect(CK.ninaWarnings('berlin')).toBe('berlin:nina:warnings');
  });

  it('services and infrastructure keys', () => {
    expect(CK.pharmacies('berlin')).toBe('berlin:pharmacies:emergency');
    expect(CK.appointments('berlin')).toBe('berlin:appointments');
    expect(CK.constructionSites('berlin')).toBe('berlin:construction:sites');
    expect(CK.aedLocations('berlin')).toBe('berlin:aed:locations');
  });

  it('water and environmental keys', () => {
    expect(CK.waterLevels('berlin')).toBe('berlin:water-levels');
    expect(CK.wastewaterSummary('berlin')).toBe('berlin:wastewater:summary');
    expect(CK.bathingSpots('berlin')).toBe('berlin:bathing:spots');
  });

  it('political keys', () => {
    expect(CK.political('berlin', 'bezirke')).toBe('berlin:political:bezirke');
    expect(CK.political('berlin', 'bundestag')).toBe('berlin:political:bundestag');
    expect(CK.political('berlin', 'state')).toBe('berlin:political:state');
  });

  it('economics keys', () => {
    expect(CK.laborMarket('berlin')).toBe('berlin:labor-market');
    expect(CK.budget('berlin')).toBe('berlin:budget');
    expect(CK.socialAtlasGeojson('berlin')).toBe('berlin:social-atlas:geojson');
  });

  it('bootstrapKeys returns all domain keys for a city', () => {
    const keys = CK.bootstrapKeys('berlin');
    expect(keys).toContain('berlin:news:digest');
    expect(keys).toContain('berlin:weather');
    expect(keys).toContain('berlin:transit:alerts');
    expect(keys.length).toBeGreaterThan(10);
  });
});
