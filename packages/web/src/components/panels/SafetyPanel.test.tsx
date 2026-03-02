/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/useCityConfig.js';
import { SafetyPanel } from './SafetyPanel.js';
import type { SafetyReport } from '../../lib/api.js';

const mockReports: SafetyReport[] = [
  { id: '1', title: 'Raub in Mitte', description: 'Am Samstag wurde ein Mann beraubt.', publishedAt: new Date(Date.now() - 3600000).toISOString(), url: 'https://example.com/1', district: 'Mitte' },
  { id: '2', title: 'Verkehrsunfall in Kreuzberg', description: 'Bei einem Unfall wurden zwei Personen verletzt.', publishedAt: new Date(Date.now() - 7200000).toISOString(), url: 'https://example.com/2', district: 'Kreuzberg' },
];

function createWrapper(reports?: SafetyReport[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (reports) {
    queryClient.setQueryData(['safety', 'berlin'], reports);
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CityProvider cityId="berlin">{children}</CityProvider>
    </QueryClientProvider>
  );
}

describe('SafetyPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
  });

  it('renders safety reports when data is available', () => {
    render(<SafetyPanel />, { wrapper: createWrapper(mockReports) });
    expect(screen.getByText(/Raub in Mitte/)).toBeTruthy();
    expect(screen.getByText(/Verkehrsunfall/)).toBeTruthy();
  });

  it('shows district tags', () => {
    render(<SafetyPanel />, { wrapper: createWrapper(mockReports) });
    expect(screen.getByText('Mitte')).toBeTruthy();
    expect(screen.getByText('Kreuzberg')).toBeTruthy();
  });

  it('shows "no recent reports" when empty', () => {
    render(<SafetyPanel />, { wrapper: createWrapper([]) });
    expect(screen.getByText(/no recent reports/i)).toBeTruthy();
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

    render(<SafetyPanel />, { wrapper });
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });
});
