import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { PoliticalDistrict } from '../../lib/api.js';
import { PoliticalStrip } from './PoliticalStrip.js';

const DISTRICTS: PoliticalDistrict[] = [
  {
    id: 'mitte',
    name: 'Mitte',
    level: 'bezirk',
    representatives: [
      { name: 'Erika Beispiel', party: 'SPD', role: 'Bezirksbürgermeister', profileUrl: 'https://example.org/profile/erika' },
    ],
  },
];

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/usePolitical.js', () => ({
  usePolitical: () => ({ data: DISTRICTS, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('PoliticalStrip profile link', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'Profile of Erika Beispiel', '→'],
    ['de', 'Profil von Erika Beispiel', '→'],
    ['tr', 'Profil: Erika Beispiel', '→'],
    ['ar', 'الملف الشخصي: Erika Beispiel', '←'],
  ])('is named after the representative in %s and keeps its arrow', async (lang, name, arrow) => {
    await i18n.changeLanguage(lang);
    render(<PoliticalStrip expanded={false} />);
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('sidebar.political.bezirke') }));

    const link = screen.getByRole('link', { name });
    expect(link.getAttribute('href')).toBe('https://example.org/profile/erika');
    expect(link.textContent).toBe(arrow);
  });
});

describe('PoliticalStrip long names in Arabic', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('runs each name and district in its own direction, so a long one is cut at its end', async () => {
    // In a right-to-left row a German name took the row's direction, and
    // truncate cut its first letters off instead of its last.
    await i18n.changeLanguage('ar');
    render(<PoliticalStrip expanded={false} />);
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('sidebar.political.bezirke') }));

    for (const text of ['Erika Beispiel', 'Mitte']) {
      const el = screen.getByText(text);
      expect(el.classList.contains('truncate')).toBe(true);
      expect(el.getAttribute('dir')).toBe('auto');
    }
    // The district is pushed to the row's end by a wrapper: on the
    // left-to-right span itself, ms-auto would push it the other way.
    const district = screen.getByText('Mitte');
    expect(district.classList.contains('ms-auto')).toBe(false);
    expect(district.parentElement!.classList.contains('ms-auto')).toBe(true);
  });
});
