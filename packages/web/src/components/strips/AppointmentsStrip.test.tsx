import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import type { ApiResponse, BuergeramtData, BuergeramtService } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { AppointmentsStrip } from './AppointmentsStrip.js';

/** UTC date `days` from today, as the appointments feed sends it. */
function inDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function service(serviceId: string, days: number): BuergeramtService {
  return { serviceId, name: serviceId, earliestDate: inDays(days), availableDays: 1, status: 'available' };
}

function createWrapper(services: BuergeramtService[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const now = new Date().toISOString();
  const data: ApiResponse<BuergeramtData> = {
    data: { services, fetchedAt: now, bookingUrl: 'https://service.berlin.de/terminvereinbarung/' },
    fetchedAt: now,
  };
  queryClient.setQueryData(['appointments', 'berlin'], data);

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppointmentsStrip in Arabic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('counts the days to the next appointment with the Arabic plural forms', async () => {
    await i18n.changeLanguage('ar');
    const services = [service('120686', 1), service('120703', 2), service('121151', 5), service('120926', 12)];
    render(<AppointmentsStrip />, { wrapper: createWrapper(services) });
    for (const text of ['خلال يوم', 'خلال يومين', 'خلال 5 أيام', 'خلال 12 يومًا']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('points the booking link arrow along the reading direction', async () => {
    await i18n.changeLanguage('ar');
    render(<AppointmentsStrip />, { wrapper: createWrapper([service('120686', 3)]) });
    expect(screen.getByRole('link').textContent).toBe('حجز موعد ←');
  });

  it('keeps the right-pointing arrow in English', () => {
    render(<AppointmentsStrip />, { wrapper: createWrapper([service('120686', 3)]) });
    expect(screen.getByRole('link').textContent).toBe('Book appointment →');
    expect(screen.getByText('in 3d')).toBeTruthy();
  });
});
