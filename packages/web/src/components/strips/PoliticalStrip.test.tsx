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
