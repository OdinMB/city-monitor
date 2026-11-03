import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { WebCityConfig } from '@city-monitor/shared';
import type { ElectionResults, PoliticalDistrict, PoliticalVote } from '../../lib/api.js';
import { berlin } from '../../config/cities/berlin.js';
import { hamburg } from '../../config/cities/hamburg.js';
import { koeln } from '../../config/cities/koeln.js';
import { muenchen } from '../../config/cities/muenchen.js';
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

const state = vi.hoisted(() => ({ city: null as WebCityConfig | null, levels: [] as string[] }));

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => state.city,
}));

vi.mock('../../hooks/usePolitical.js', () => ({
  usePolitical: (_cityId: string, level: string) => {
    state.levels.push(level);
    return { data: DISTRICTS, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

const ELECTION: ElectionResults = {
  election: 'abgeordnetenhaus',
  date: '2026-09-20',
  areaLevel: 'wahlkreis',
  sourceUrl: 'https://example.org/results.xlsx',
  total: {
    id: 'total', name: 'Berlin', turnout: 74.2, otherPct: 4.9, leader: 'Die Linke', eligible: null, voters: null,
    shares: [
      { party: 'Die Linke', pct: 25.7 }, { party: 'CDU', pct: 18.8 }, { party: 'AfD', pct: 16.3 },
      { party: 'Grüne', pct: 14.3 }, { party: 'SPD', pct: 12.1 }, { party: 'BSW', pct: 4.0 }, { party: 'FDP', pct: 3.9 },
    ],
  },
  areas: [
    { id: '0101', name: 'Mitte 1', turnout: 70, otherPct: 5, leader: 'Die Linke', shares: [] },
    { id: '0102', name: 'Mitte 2', turnout: 71, otherPct: 5, leader: 'Die Linke', shares: [] },
    { id: '0201', name: 'Friedrichshain-Kreuzberg 1', turnout: 72, otherPct: 5, leader: 'Grüne', shares: [] },
  ],
};

vi.mock('../../hooks/useElectionResults.js', () => ({
  useElectionResults: (_cityId: string, enabled: boolean) => ({
    data: enabled ? { data: ELECTION, fetchedAt: null } : undefined, isLoading: false, isError: false, refetch: vi.fn(),
  }),
}));

const votes = vi.hoisted(() => ({ data: [] as PoliticalVote[], enabled: [] as boolean[] }));

vi.mock('../../hooks/usePoliticalVotes.js', () => ({
  usePoliticalVotes: (_cityId: string, enabled: boolean) => {
    votes.enabled.push(enabled);
    return { data: votes.data };
  },
}));

const counts = (yes: number, no: number, abstain: number, noShow: number) => ({ yes, no, abstain, noShow });
const poll = (id: number, parliament: PoliticalVote['parliament'], accepted: boolean): PoliticalVote => ({
  id, parliament, title: `Antrag ${id}`, date: '2026-10-16', accepted, topics: [], url: `https://www.abgeordnetenwatch.de/p/${id}`,
  totals: counts(303, 210, 52, 65), city: counts(1, 1, 0, 0),
  members: [{ name: 'Anna Alpha', party: 'SPD', vote: 'yes' }, { name: 'Carl Cee', party: 'CDU', vote: 'no' }],
});

beforeEach(() => {
  state.city = berlin;
  state.levels = [];
  votes.data = [];
  votes.enabled = [];
});

describe('PoliticalStrip views per city', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('gives Berlin its state members by Bezirk, its district mayors, the Bundestag and the election', () => {
    render(<PoliticalStrip expanded={false} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(state.levels.at(-1)).toBe('state-bezirke');
  });

  it('gives Hamburg its state parliament by constituency, the Bundestag and the election, with no district-mayor view', () => {
    state.city = hamburg;
    render(<PoliticalStrip expanded={false} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tab', { name: i18n.t('sidebar.political.bezirke') })).toBeNull();
    expect(state.levels.at(-1)).toBe('state');
  });

  it('gives Köln its Landtag members by constituency, its Oberbürgermeister, its district mayors and the Bundestag', async () => {
    state.city = koeln;
    render(<PoliticalStrip expanded={false} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      i18n.t('sidebar.political.landesparlament'), i18n.t('sidebar.political.mayor'),
      i18n.t('sidebar.political.bezirke'), i18n.t('sidebar.political.bundestag'),
    ]);
    expect(state.levels.at(-1)).toBe('state');

    fireEvent.click(screen.getByRole('tab', { name: i18n.t('sidebar.political.mayor') }));
    expect(state.levels.at(-1)).toBe('mayor');
    // One office holder: the list without a count line
    expect(screen.getByText('Erika Beispiel')).toBeTruthy();
    expect(screen.queryByText(i18n.t('panel.political.representatives', { count: 1 }))).toBeNull();
  });

  it('gives München its Landtag, its Oberbürgermeister, the Bundestag and the election, with no district-mayor view', () => {
    state.city = muenchen;
    render(<PoliticalStrip expanded={false} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByRole('tab', { name: i18n.t('sidebar.political.bezirke') })).toBeNull();
  });

  it('shows the city-wide election result: five parties collapsed, every party and the strongest per area expanded', () => {
    const { unmount } = render(<PoliticalStrip expanded={false} />);
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('panel.elections.tab') }));
    expect(screen.getByText('Die Linke')).toBeTruthy();
    expect(screen.getByText('SPD')).toBeTruthy();
    expect(screen.queryByText('BSW')).toBeNull();
    expect(screen.getByText(i18n.t('panel.political.showMore', { count: 2 }))).toBeTruthy();
    expect(screen.getByText('74.2 %')).toBeTruthy();
    expect(screen.queryByText(i18n.t('sidebar.electionLegend.strongest', { context: 'wahlkreis' }))).toBeNull();
    unmount();

    render(<PoliticalStrip expanded />);
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('panel.elections.tab') }));
    expect(screen.getByText('FDP')).toBeTruthy();
    expect(screen.getByText(i18n.t('sidebar.electionLegend.strongest', { context: 'wahlkreis' }))).toBeTruthy();
  });

  it('calls Köln\'s and München\'s state parliament the Landtag in German', async () => {
    await i18n.changeLanguage('de');
    for (const city of [koeln, muenchen]) {
      state.city = city;
      const { unmount } = render(<PoliticalStrip expanded={false} />);
      expect(screen.getAllByRole('tab')[0]!.textContent, city.id).toBe('Landtag');
      unmount();
    }
  });

  it('names each city\'s state parliament in German', async () => {
    await i18n.changeLanguage('de');
    const names = [berlin, hamburg].map((city) => {
      state.city = city;
      const { unmount } = render(<PoliticalStrip expanded={false} />);
      const name = screen.getAllByRole('tab')[0]!.textContent;
      unmount();
      return name;
    });
    expect(new Set(names).size).toBe(2);
  });
});

describe('PoliticalStrip roll-call votes', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('shows each parliament its own votes, the newest only while collapsed', () => {
    state.city = hamburg;
    votes.data = [poll(1, 'bundestag', true), poll(2, 'bundestag', false), poll(3, 'state', true)];
    render(<PoliticalStrip expanded={false} />);

    expect(screen.getByText('Antrag 3')).toBeTruthy();
    expect(screen.queryByText('Antrag 1')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('sidebar.political.bundestag') }));
    expect(screen.getByText('Antrag 1')).toBeTruthy();
    expect(screen.queryByText('Antrag 2')).toBeNull();
    expect(screen.getByText(i18n.t('panel.political.showMore', { count: 1 }))).toBeTruthy();
    expect(screen.getByText(i18n.t('panel.political.votes.accepted'))).toBeTruthy();
  });

  it('lists all votes when expanded and opens the members of one', () => {
    state.city = hamburg;
    votes.data = [poll(1, 'bundestag', true), poll(2, 'bundestag', false)];
    render(<PoliticalStrip expanded />);
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('sidebar.political.bundestag') }));

    expect(screen.getByText('Antrag 2')).toBeTruthy();
    expect(screen.getByText(i18n.t('panel.political.votes.rejected'))).toBeTruthy();
    expect(screen.queryByText('Carl Cee')).toBeNull();
    const [first] = screen.getAllByRole('button', { name: i18n.t('panel.political.votes.showMembers') });
    fireEvent.click(first!);
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Carl Cee')).toBeTruthy();
  });

  it('asks for the votes only in the state and Bundestag views', () => {
    votes.data = [poll(3, 'state', true)];
    render(<PoliticalStrip expanded={false} />);
    expect(votes.enabled.at(-1)).toBe(true);
    expect(screen.getByText(i18n.t('panel.political.votes.accepted'))).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('sidebar.political.bezirke') }));
    expect(votes.enabled.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('panel.elections.tab') }));
    expect(votes.enabled.at(-1)).toBe(false);
    expect(screen.queryByText(i18n.t('panel.political.votes.accepted'))).toBeNull();
  });

  it.each(['de', 'tr', 'ar'])('labels the vote values in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    for (const choice of ['yes', 'no', 'abstain', 'no_show']) {
      const key = `panel.political.votes.choice.${choice}`;
      expect(i18n.t(key)).not.toBe(i18n.t(key, { lng: 'en' }));
    }
  });
});

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
