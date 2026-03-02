/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/useCityConfig.js';
import { EventsPanel } from './EventsPanel.js';
import type { CityEvent } from '../../lib/api.js';

const tomorrow = new Date(Date.now() + 86400000).toISOString();

const mockEvents: CityEvent[] = [
  { id: '1', title: 'Berliner Philharmoniker', venue: 'Philharmonie', date: tomorrow, category: 'music', url: 'https://example.com' },
  { id: '2', title: 'Street Food Thursday', venue: 'Markthalle Neun', date: tomorrow, category: 'food', url: 'https://example.com/2', free: true },
];

function createWrapper(events?: CityEvent[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (events) {
    queryClient.setQueryData(['events', 'berlin'], events);
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CityProvider cityId="berlin">{children}</CityProvider>
    </QueryClientProvider>
  );
}

describe('EventsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
  });

  it('renders events when data is available', () => {
    render(<EventsPanel />, { wrapper: createWrapper(mockEvents) });
    expect(screen.getByText(/Berliner Philharmoniker/)).toBeTruthy();
    expect(screen.getByText(/Street Food Thursday/)).toBeTruthy();
  });

  it('shows venue names', () => {
    render(<EventsPanel />, { wrapper: createWrapper(mockEvents) });
    expect(screen.getByText(/Philharmonie/)).toBeTruthy();
  });

  it('shows "no upcoming events" when empty', () => {
    render(<EventsPanel />, { wrapper: createWrapper([]) });
    expect(screen.getByText(/no events this week/i)).toBeTruthy();
  });

  it('shows skeleton when loading', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </QueryClientProvider>
    );

    render(<EventsPanel />, { wrapper });
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });
});
