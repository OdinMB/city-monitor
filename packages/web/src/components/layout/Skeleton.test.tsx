import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { Skeleton } from './Skeleton.js';

describe('Skeleton', () => {
  afterEach(async () => {
    // Unmount first, so the language switch re-renders nothing outside act().
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('tells screen readers the tile is loading, once, while the shimmer bars stay hidden', () => {
    render(<Skeleton lines={4} />);
    // One status per skeleton, so a dashboard of loading tiles is one short
    // "Loading" each rather than a region per bar.
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0].textContent).toBe('Loading…');
    const bars = statuses[0].querySelectorAll('.skeleton-shimmer');
    expect(bars).toHaveLength(4);
    for (const bar of bars) expect(bar.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('keeps the loading word out of sight', () => {
    render(<Skeleton />);
    expect(screen.getByText('Loading…').classList.contains('sr-only')).toBe(true);
  });

  it.each([
    ['de', 'Wird geladen…'],
    ['tr', 'Yükleniyor…'],
    ['ar', 'جارٍ التحميل…'],
  ])('says "Loading" in the UI language (%s)', async (lang, expected) => {
    await i18n.changeLanguage(lang);
    render(<Skeleton />);
    expect(screen.getByRole('status').textContent).toBe(expected);
  });

  it('keeps its test id for the strip tests', () => {
    render(<Skeleton />);
    expect(screen.getByTestId('skeleton')).toBe(screen.getByRole('status'));
  });
});
