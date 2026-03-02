/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/useCityConfig.js';
import { TransitPanel } from './TransitPanel.js';
import type { TransitAlert } from '../../lib/api.js';

const mockAlerts: TransitAlert[] = [
  { id: '1', line: 'U2', type: 'disruption', severity: 'high', message: 'Störung Alexanderplatz – Ruhleben', detail: 'Wegen einer Signalstörung zwischen Alexanderplatz und Ruhleben.', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: ['Alexanderplatz', 'Ruhleben'] },
  { id: '2', line: 'S1', type: 'delay', severity: 'medium', message: 'Verspätungen S1', detail: 'Verspätungen S1', station: 'Friedrichstraße', location: { lat: 52.52, lon: 13.39 }, affectedStops: [] },
];

function createWrapper(alerts?: TransitAlert[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (alerts) {
    queryClient.setQueryData(['transit', 'berlin'], alerts);
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CityProvider cityId="berlin">{children}</CityProvider>
    </QueryClientProvider>
  );
}

describe('TransitPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
  });

  it('renders transit alerts when data is available', () => {
    render(<TransitPanel />, { wrapper: createWrapper(mockAlerts) });
    expect(screen.getAllByText(/U2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/S1/).length).toBeGreaterThan(0);
  });

  it('shows "all clear" when no disruptions', () => {
    render(<TransitPanel />, { wrapper: createWrapper([]) });
    expect(screen.getByText(/all clear/i)).toBeTruthy();
  });

  it('shows line badges', () => {
    render(<TransitPanel />, { wrapper: createWrapper(mockAlerts) });
    expect(screen.getByText('U2')).toBeTruthy();
    expect(screen.getByText('S1')).toBeTruthy();
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

    render(<TransitPanel />, { wrapper });
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });
});
