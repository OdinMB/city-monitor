/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNewsDigest } from './useNewsDigest.js';

const mockDigest = {
  items: [
    { id: '1', title: 'BVG Störung', url: 'https://example.com/1', publishedAt: '2026-03-01T10:00:00Z', sourceName: 'rbb24', category: 'transit', tier: 1 },
    { id: '2', title: 'Berlinale News', url: 'https://example.com/2', publishedAt: '2026-03-01T09:00:00Z', sourceName: 'Tagesspiegel', category: 'culture', tier: 2 },
  ],
  categories: {
    transit: [{ id: '1', title: 'BVG Störung', url: 'https://example.com/1', publishedAt: '2026-03-01T10:00:00Z', sourceName: 'rbb24', category: 'transit', tier: 1 }],
    culture: [{ id: '2', title: 'Berlinale News', url: 'https://example.com/2', publishedAt: '2026-03-01T09:00:00Z', sourceName: 'Tagesspiegel', category: 'culture', tier: 2 }],
  },
  updatedAt: '2026-03-01T10:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useNewsDigest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches news digest for a city', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: mockDigest, fetchedAt: '2026-03-01T10:00:00Z' }), { status: 200 }),
    );

    const { result } = renderHook(() => useNewsDigest('berlin'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(2);
    expect(result.current.data?.categories).toHaveProperty('transit');
  });

  it('handles fetch errors after retries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const { result } = renderHook(() => useNewsDigest('berlin'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 10_000 });
  });
});
