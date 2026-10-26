import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BuergeramtData, CityEvent, CouncilMeeting, PoliticalDistrict, TransitAlert } from '@city-monitor/shared';
import { AppointmentsStrip } from './AppointmentsStrip.js';
import { TransitStrip } from './TransitStrip.js';
import { CouncilMeetingsStrip } from './CouncilMeetingsStrip.js';
import { EventsStrip } from './EventsStrip.js';
import { PoliticalStrip } from './PoliticalStrip.js';

/**
 * Target size (WCAG 2.5.8), visible focus (2.4.7) and muted-text contrast
 * (1.4.3) in tile content. jsdom does no layout and applies no stylesheet, so
 * these check the classes each fix relies on: a 24px minimum, reached with
 * min-h-6/min-w-6 or padding, plus a negative margin of the same size so the
 * tile's layout does not move.
 */

const fixtures = vi.hoisted(() => {
  const appointments: BuergeramtData = {
    services: Array.from({ length: 7 }, (_, i) => ({
      serviceId: `s${i}`,
      name: `Service ${i}`,
      earliestDate: null,
      availableDays: 0,
      status: 'unknown' as const,
    })),
    fetchedAt: '2026-10-26T08:00:00Z',
    bookingUrl: 'https://service.berlin.de/terminvereinbarung/',
  };
  const transit: TransitAlert[] = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i}`,
    line: 'U8',
    lines: ['U8'],
    type: 'delay' as const,
    severity: 'low' as const,
    message: `Delay ${i}`,
    detail: '',
    station: 'Alexanderplatz',
    location: null,
    affectedStops: [],
  }));
  const meetings: CouncilMeeting[] = [{
    id: 'm1',
    source: 'parliament',
    committee: 'Plenarsitzung',
    start: '2026-10-27T10:00:00Z',
    location: 'Abgeordnetenhaus, Plenarsaal',
    webUrl: 'https://www.parlament-berlin.de/',
  }];
  const events: CityEvent[] = [
    { id: 'e1', title: 'Konzert', date: '2026-10-27T19:00:00Z', category: 'music', url: 'https://example.org/e1', source: 'kulturdaten' },
    { id: 'e2', title: 'Ausstellung', date: '2026-10-28T10:00:00Z', category: 'art', url: 'https://example.org/e2', source: 'ticketmaster' },
    { id: 'e3', title: 'Theater', date: '2026-10-29T20:00:00Z', category: 'theater', url: 'https://example.org/e3', source: 'kulturdaten' },
  ];
  const political: PoliticalDistrict[] = [{
    id: 'd1',
    name: 'Mitte',
    level: 'bezirk',
    representatives: Array.from({ length: 7 }, (_, i) => ({
      name: `Person ${i}`,
      party: 'SPD',
      role: 'Bezirksbürgermeister',
      profileUrl: `https://example.org/p${i}`,
    })),
  }];
  const loaded = <T,>(data: T) => ({ data, fetchedAt: null, isLoading: false, isError: false, refetch: () => {} });
  return { appointments, transit, meetings, events, political, loaded };
});

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));
vi.mock('../../hooks/useAppointments.js', () => ({ useAppointments: () => fixtures.loaded(fixtures.appointments) }));
vi.mock('../../hooks/useTransit.js', () => ({ useTransit: () => fixtures.loaded(fixtures.transit) }));
vi.mock('../../hooks/useCouncilMeetings.js', () => ({ useCouncilMeetings: () => fixtures.loaded(fixtures.meetings) }));
vi.mock('../../hooks/useEvents.js', () => ({ useEvents: () => fixtures.loaded(fixtures.events) }));
vi.mock('../../hooks/usePolitical.js', () => ({ usePolitical: () => fixtures.loaded(fixtures.political) }));

function expectClasses(el: Element, classes: string[]) {
  for (const cls of classes) {
    expect(el.classList.contains(cls), `expected class "${cls}" on ${el.outerHTML.slice(0, 80)}…`).toBe(true);
  }
}

describe('tile tap targets are at least 24px (WCAG 2.5.8)', () => {
  it('Appointments "+N more": 8px top padding on a 16px line, 4px of it taken from the gap above', () => {
    render(<AppointmentsStrip />);
    const more = screen.getByRole('button', { name: /^\+2 more$/ });
    expectClasses(more, ['text-xs', 'pt-2', '-mt-1']);
  });

  it('Transit "+N more": 6px + 2px padding on a 16px line, the 2px taken back below', () => {
    render(<TransitStrip />);
    const more = screen.getByRole('button', { name: /^\+2 more$/ });
    expectClasses(more, ['text-xs', 'pt-1.5', 'pb-0.5', '-mb-0.5']);
  });

  it('Council meetings: the link icon sits in a 24px box that keeps the row width', () => {
    render(<CouncilMeetingsStrip />);
    const link = screen.getByRole('link', { name: 'Open meeting details' });
    expectClasses(link, ['min-w-6', 'min-h-6', '-mx-1']);
    // The box reaches 4px past the row's inline end. The list pads that side
    // logically (pe-2), so in Arabic (RTL) it has room on the left too and
    // the list does not scroll sideways.
    const list = link.closest('.overflow-y-auto');
    expect(list).not.toBeNull();
    expectClasses(list!, ['pe-2']);
    expect(list!.classList.contains('pr-2')).toBe(false);
  });

  it('Political: each representative\'s arrow link is a 24px box that keeps the row height', () => {
    render(<PoliticalStrip expanded={false} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Districts' }));
    const links = screen.getAllByRole('link', { name: '→' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expectClasses(link, ['min-w-6', 'min-h-6', '-my-1']);
  });

  it('Events: the "More info" link in an opened card is 24px tall', () => {
    render(<EventsStrip />);
    fireEvent.click(screen.getByText('Konzert'));
    expectClasses(screen.getByRole('link', { name: /More info/ }), ['min-h-6']);
  });
});

describe('Events filter chips keep a visible focus ring (WCAG 2.4.7)', () => {
  it('pads each scrolling chip row by 4px, so the 2px outline at 2px offset is not clipped', () => {
    render(<EventsStrip />);
    const rows = screen.getAllByRole('tablist');
    expect(rows).toHaveLength(2); // source and category
    for (const row of rows) {
      expect(row.classList.contains('overflow-x-auto')).toBe(true);
      const padded = row.classList.contains('p-1') || (row.classList.contains('px-1') && row.classList.contains('pt-1'));
      expect(padded).toBe(true);
      // Negative margins keep the chips in place; scroll padding keeps a chip
      // scrolled into view by keyboard focus clear of the edge.
      expectClasses(row, ['-mx-1', '-mt-1', 'scroll-px-1']);
    }
  });
});

describe('muted tile text meets 4.5:1 (WCAG 1.4.3)', () => {
  it('uses gray-500 in light mode and gray-400 in dark mode, never gray-400 in light mode', () => {
    render(<CouncilMeetingsStrip />);
    const location = screen.getByText('Abgeordnetenhaus, Plenarsaal');
    expectClasses(location, ['text-gray-500', 'dark:text-gray-400']);
    expect(location.classList.contains('text-gray-400')).toBe(false);
  });

  it('keeps the Appointments "checking" summary readable', () => {
    render(<AppointmentsStrip />);
    const summary = screen.getByText('Checking availability…');
    expectClasses(summary, ['text-gray-500', 'dark:text-gray-400']);
  });
});
