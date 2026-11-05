import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CityEvent } from '../../lib/api.js';
import { EventsStrip, HHT_REPORT_URL, HHT_SUGGEST_URL } from './EventsStrip.js';

const CATEGORIES: CityEvent['category'][] = ['music', 'art', 'theater', 'food', 'market', 'sport', 'community', 'museum', 'other'];
const SOURCES: CityEvent['source'][] = ['kulturdaten', 'ticketmaster', 'gomus', 'stadt-koeln'];

// Every category from all sources: both filter rows render, each wider than a phone-width tile.
const EVENTS: CityEvent[] = CATEGORIES.map((category, i) => ({
  id: `e${i}`,
  title: `Event ${i}`,
  date: '2026-10-27T19:00:00',
  category,
  url: `https://example.com/events/${i}`,
  source: SOURCES[i % SOURCES.length]!,
}));

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

const shown = vi.hoisted(() => ({ events: null as CityEvent[] | null }));

vi.mock('../../hooks/useEvents.js', () => ({
  useEvents: () => ({ data: shown.events ?? EVENTS, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

afterEach(() => {
  shown.events = null;
});

const HHT_EVENT: CityEvent = {
  id: 'hht-1',
  title: 'Wochenmarkt am Platzhalterplatz',
  venue: 'Platzhalter-Markt',
  date: '2026-10-27T08:00:00',
  category: 'market',
  url: 'https://example.org/markt',
  bookingUrl: 'https://example.org/markt/buchen',
  source: 'hht',
};

describe('EventsStrip links and times', () => {
  it('shows the event link and the booking link apart in the expanded row', () => {
    shown.events = [HHT_EVENT];
    render(<EventsStrip />);
    fireEvent.click(screen.getByRole('button', { name: /Wochenmarkt/ }));
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://example.org/markt');
    expect(hrefs).toContain('https://example.org/markt/buchen');
  });

  it("marks HHT's text as German", () => {
    shown.events = [HHT_EVENT];
    render(<EventsStrip />);
    expect(screen.getByText('Wochenmarkt am Platzhalterplatz').getAttribute('lang')).toBe('de');
  });

  it("links HHT's event suggestion form and error address while HHT events are shown", () => {
    shown.events = [HHT_EVENT];
    render(<EventsStrip />);
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(HHT_SUGGEST_URL);
    expect(hrefs).toContain(HHT_REPORT_URL);
  });

  it('has no HHT links without HHT events', () => {
    render(<EventsStrip />);
    const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain(HHT_SUGGEST_URL);
    expect(hrefs).not.toContain(HHT_REPORT_URL);
  });

  it("shows an event's own wall-clock time, with or without an offset, whatever the browser's zone", () => {
    shown.events = [
      { ...HHT_EVENT, id: 'a', title: 'Ohne Offset', date: '2026-10-27T20:15:00' },
      { ...HHT_EVENT, id: 'b', title: 'Gespeichert', date: '2026-10-28T09:45:00.000Z' },
    ];
    const zone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      render(<EventsStrip />);
    } finally {
      process.env.TZ = zone;
    }
    expect(screen.getByText(/20:15/)).toBeTruthy();
    expect(screen.getByText(/09:45/)).toBeTruthy();
  });
});

describe('EventsStrip filter rows', () => {
  it('wraps both chip rows instead of clipping them in a horizontal scroller', () => {
    render(<EventsStrip />);
    const rows = screen.getAllByRole('tablist');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.classList.contains('flex-wrap')).toBe(true);
      expect(row.classList.contains('overflow-x-auto')).toBe(false);
    }
  });

  it('runs each event title in its own direction, so a long one is cut at its end in Arabic', () => {
    render(<EventsStrip />);
    const title = screen.getByText('Event 0');
    expect(title.classList.contains('truncate')).toBe(true);
    expect(title.getAttribute('dir')).toBe('auto');
  });

  it('still offers every source and category chip', () => {
    render(<EventsStrip />);
    const [sourceRow, categoryRow] = screen.getAllByRole('tablist');
    expect(sourceRow!.querySelectorAll('[role="tab"]')).toHaveLength(1 + SOURCES.length);
    expect(categoryRow!.querySelectorAll('[role="tab"]')).toHaveLength(1 + CATEGORIES.length);
  });
});
