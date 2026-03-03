/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSafety } from './useSafety.js';

const mockData = [
  { id: '1', title: 'Report', description: 'Test', publishedAt: '2026-03-01T10:00:00Z', url: 'https://example.com', district: 'Mitte' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useSafety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches data for a city', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: mockData, fetchedAt: '2026-03-02T10:00:00Z' }), { status: 200 }),
    );

    const { result } = renderHook(() => useSafety('berlin'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeTruthy();
  });

  it('handles fetch errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const { result } = renderHook(() => useSafety('berlin'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 10_000 });
  });
});
