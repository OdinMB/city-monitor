/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/useCityConfig.js';
import { MapPanel } from './MapPanel.js';

// maplibre-gl is mocked globally in test-setup.ts

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CityProvider cityId="berlin">{children}</CityProvider>
    </QueryClientProvider>
  );
}

describe('MapPanel', () => {
  it('renders a map container with the correct title', () => {
    render(<MapPanel />, { wrapper: createWrapper() });
    expect(screen.getByText('Map')).toBeTruthy();
  });

  it('renders a map container element', () => {
    render(<MapPanel />, { wrapper: createWrapper() });
    expect(document.querySelector('[data-testid="map-container"]')).toBeTruthy();
  });
});
