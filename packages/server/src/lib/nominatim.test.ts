/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocode } from './nominatim.js';

describe('nominatim', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns coordinates from Nominatim response', async () => {
    const mockResponse = [
      { lat: '52.5219184', lon: '13.4132147', display_name: 'Alexanderplatz, Mitte, Berlin' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await geocode('Alexanderplatz', 'Berlin');
    expect(result).toEqual({
      lat: 52.5219184,
      lon: 13.4132147,
      displayName: 'Alexanderplatz, Mitte, Berlin',
    });
  });

  it('returns null when no results found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await geocode('Nonexistent Place XYZ', 'Berlin');
    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429 }),
    );

    const result = await geocode('Alexanderplatz', 'Berlin');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await geocode('Alexanderplatz', 'Berlin');
    expect(result).toBeNull();
  });
});
