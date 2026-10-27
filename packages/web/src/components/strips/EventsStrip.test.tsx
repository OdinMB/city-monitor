import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CityEvent } from '../../lib/api.js';
import { EventsStrip } from './EventsStrip.js';

const CATEGORIES: CityEvent['category'][] = ['music', 'art', 'theater', 'food', 'market', 'sport', 'community', 'museum', 'other'];
const SOURCES: CityEvent['source'][] = ['kulturdaten', 'ticketmaster', 'gomus'];

// Every category from all three sources: both filter rows render, each wider than a phone-width tile.
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

vi.mock('../../hooks/useEvents.js', () => ({
  useEvents: () => ({ data: EVENTS, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

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
