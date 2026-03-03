/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useBootstrap } from './useBootstrap.js';

const mockBootstrap = {
  news: { items: [{ id: '1', title: 'Test' }], categories: {}, updatedAt: '2026-03-01T00:00:00Z' },
  weather: null,
  transit: null,
  events: null,
  safety: null,
  nina: null,
  airQuality: { current: { europeanAqi: 42, pm25: 10, pm10: 20, no2: 15, o3: 30, updatedAt: '2026-03-01T00:00:00Z' }, hourly: [] },
  pharmacies: null,
  traffic: null,
  construction: null,
  waterLevels: null,
  budget: null,
  appointments: null,
  laborMarket: null,
  wastewater: null,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    queryClient,
  };
}

describe('useBootstrap', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches bootstrap data and hydrates query cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockBootstrap), { status: 200 }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useBootstrap('berlin'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.news).toBeTruthy();

    // Verify cache hydration
    await waitFor(() => {
      const newsData = queryClient.getQueryData(['news', 'digest', 'berlin']);
      expect(newsData).toEqual(mockBootstrap.news);
    });
  });

  it('hydrates air quality data into query cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockBootstrap), { status: 200 }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useBootstrap('berlin'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => {
      const aqData = queryClient.getQueryData(['air-quality', 'berlin']);
      expect(aqData).toEqual(mockBootstrap.airQuality);
    });
  });

  it('does not hydrate cache slots that are null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockBootstrap), { status: 200 }),
    );

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useBootstrap('berlin'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const weatherData = queryClient.getQueryData(['weather', 'berlin']);
    expect(weatherData).toBeUndefined();
  });
});
