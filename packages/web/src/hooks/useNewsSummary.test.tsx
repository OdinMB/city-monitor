/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNewsSummary } from './useNewsSummary.js';

const mockSummary = {
  briefing: 'Berlin saw major transit disruptions today.',
  generatedAt: '2026-03-02T10:00:00Z',
  headlineCount: 10,
  cached: true,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useNewsSummary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches news summary for a city', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: mockSummary, fetchedAt: '2026-03-02T10:00:00Z' }), { status: 200 }),
    );

    const { result } = renderHook(() => useNewsSummary('berlin'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.briefing).toBe('Berlin saw major transit disruptions today.');
  });
});
