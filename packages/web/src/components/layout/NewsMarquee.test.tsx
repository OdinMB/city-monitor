import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { NewsMarquee } from './NewsMarquee.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
/** globals.css without its comments, whose commas and words would get in the way of the rules. */
const rules = () => read('../../globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

// Mock hooks
vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

const mockItems = [
  { id: '1', title: 'First headline', url: 'https://example.com/1', sourceName: 'Source A', publishedAt: '2026-03-14T10:00:00Z', category: 'news', tier: 1 },
  { id: '2', title: 'Second headline', url: 'https://example.com/2', sourceName: 'Source B', publishedAt: '2026-03-14T09:00:00Z', category: 'news', tier: 1 },
];

vi.mock('../../hooks/useNewsDigest.js', () => ({
  useNewsDigest: () => ({
    data: { items: mockItems, categories: {}, updatedAt: '2026-03-14T10:00:00Z' },
    fetchedAt: '2026-03-14T10:00:00Z',
  }),
}));

describe('NewsMarquee', () => {
  afterEach(async () => {
    // Unmount first, so the language switch re-renders nothing outside act().
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('renders headlines with source names', () => {
    render(<NewsMarquee />);
    expect(screen.getAllByText('First headline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Source A').length).toBeGreaterThanOrEqual(1);
  });

  it('renders links to article URLs', () => {
    render(<NewsMarquee />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0].getAttribute('href')).toBe('https://example.com/1');
    expect(links[0].getAttribute('target')).toBe('_blank');
  });

  it('has role="marquee" and aria-live="off"', () => {
    const { container } = render(<NewsMarquee />);
    const marquee = container.querySelector('[role="marquee"]');
    expect(marquee).toBeTruthy();
    expect(marquee?.getAttribute('aria-live')).toBe('off');
  });

  it('duplicates content for seamless loop', () => {
    const { container } = render(<NewsMarquee />);
    const contents = container.querySelectorAll('.marquee-content');
    expect(contents.length).toBe(2);
    // Second copy has aria-hidden
    expect(contents[1].getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the loop copy out of the Tab order and away from screen readers, but clickable', () => {
    const { container } = render(<NewsMarquee />);
    const [first, copy] = container.querySelectorAll('.marquee-content');
    // The first copy is the one to read and tab through.
    expect(first.getAttribute('aria-hidden')).toBeNull();
    for (const link of first.querySelectorAll('a')) expect(link.getAttribute('tabindex')).toBeNull();
    // An aria-hidden link that can still take focus is announced as nothing.
    // Not inert: the copy is on screen half the time, and a click on it opens the headline.
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.hasAttribute('inert')).toBe(false);
    const copyLinks = [...copy.querySelectorAll('a')];
    expect(copyLinks).toHaveLength(2);
    for (const link of copyLinks) {
      expect(link.getAttribute('tabindex')).toBe('-1');
      expect(link.getAttribute('href')).toMatch(/^https:\/\/example\.com\//);
    }
    // Only the first copy's links are in the accessibility tree.
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('isolates each headline and source name, so a German headline keeps its word order in Arabic', () => {
    render(<NewsMarquee />);
    const link = screen.getAllByRole('link')[0];
    const isolated = [...link.querySelectorAll('bdi')].map((el) => el.textContent);
    expect(isolated).toEqual(['Source A', 'First headline']);
  });

  it('shows the source name in the muted colour role (4.5:1), not gray-400', () => {
    render(<NewsMarquee />);
    const source = screen.getAllByText('Source A')[0];
    expect(source.classList.contains('text-muted')).toBe(true);
    expect(source.className).not.toMatch(/text-gray-/);
  });

  it('names the headline region', () => {
    const { container } = render(<NewsMarquee />);
    expect(container.querySelector('[role="marquee"]')?.getAttribute('aria-label')).toBe(i18n.t('panel.news.headlines'));
  });

  it('loops without a jump: half the track is exactly one copy and the space after it', () => {
    const { container } = render(<NewsMarquee />);
    // The animation moves the track by half its width. With a gap between the
    // copies, half the track is one copy plus half the gap, and the loop
    // jumped by the other half. Each copy carries its own trailing space.
    const track = container.querySelector('.marquee-track')!;
    expect([...track.classList].filter((c) => c.startsWith('gap-'))).toEqual([]);
    for (const copy of container.querySelectorAll('.marquee-content')) {
      expect(copy.classList.contains('pe-8')).toBe(true);
    }
  });

  it('runs the headlines left to right in every language, so a German headline enters start first', async () => {
    // The headlines are German feed text. Moving rightwards, as an Arabic
    // page's inline end would have it, brought each one in end first. The
    // scrolling area keeps their own direction: laid out from the left edge
    // and moved leftwards, in Arabic as in German.
    await i18n.changeLanguage('ar');
    const { container } = render(<NewsMarquee />);
    const viewport = container.querySelector('[role="marquee"]')!;
    expect(viewport.getAttribute('dir')).toBe('ltr');
    expect(viewport.querySelector('.marquee-track')).toBeTruthy();
    // jsdom applies no stylesheet, so this checks the rules themselves.
    const css = rules();
    const keyframes = css.match(/@keyframes marquee \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(keyframes).toContain('to { transform: translateX(-50%); }');
    expect(css).not.toMatch(/\[dir='rtl'\] \.marquee-track/);
  });

  it('pauses while the pointer is over the headlines or one of them has keyboard focus', () => {
    // The pause button sits outside the scrolling area, so hovering or
    // focusing it does not hold the ticker still against its own Resume.
    const css = rules();
    const pausedRules = [...css.matchAll(/([^{}]+)\{\s*animation-play-state: paused;\s*\}/g)]
      .map((m) => m[1].split(',').map((s) => s.trim()));
    const selectors = pausedRules.flat();
    expect(selectors).toEqual(expect.arrayContaining([
      '.marquee-viewport:hover .marquee-track',
      '.marquee-viewport:has(:focus-visible) .marquee-track',
      '.marquee-paused .marquee-track',
    ]));
    expect(selectors).not.toContain('.marquee-container:hover .marquee-track');
    // A browser without :has() drops a whole selector list that contains one,
    // so the focus rule must stand alone or hover and the button stop pausing.
    for (const list of pausedRules.filter((l) => l.some((s) => s.includes(':has(')))) {
      expect(list).toEqual(['.marquee-viewport:has(:focus-visible) .marquee-track']);
    }
  });

  it('shows every headline, still and scrollable, under reduced motion', () => {
    // Stopped in place it showed the first two headlines and clipped the rest.
    const css = rules();
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.marquee-track[\s\S]*?\n\}/)?.[0] ?? '';
    expect(reduced).toMatch(/\.marquee-track \{\s*animation: none;\s*\}/);
    expect(reduced).toMatch(/\.marquee-viewport \{[^}]*overflow-x: auto;/);
    // The loop copy and the pause button have nothing to do when nothing moves.
    expect(reduced).toMatch(/\.marquee-content\[aria-hidden='true'\],\s*\.marquee-toggle \{\s*display: none;\s*\}/);
  });

  it('has a pause button that stops and resumes the ticker', () => {
    const { container } = render(<NewsMarquee />);
    const bar = container.firstElementChild!;
    const button = screen.getByRole('button', { name: 'Pause news ticker' });
    expect(bar.classList.contains('marquee-paused')).toBe(false);

    fireEvent.click(button);
    expect(bar.classList.contains('marquee-paused')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Resume news ticker');

    fireEvent.click(button);
    expect(bar.classList.contains('marquee-paused')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Pause news ticker');
  });

  it('gives the pause button a 24px target outside the scrolling area', () => {
    const { container } = render(<NewsMarquee />);
    const button = screen.getByRole('button', { name: 'Pause news ticker' });
    expect(button.classList.contains('marquee-toggle')).toBe(true);
    expect(button.classList.contains('w-6')).toBe(true);
    expect(button.classList.contains('h-6')).toBe(true);
    expect(container.querySelector('[role="marquee"]')!.contains(button)).toBe(false);
  });

  it.each(['de', 'tr', 'ar'])('names the pause button in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<NewsMarquee />);
    const pause = i18n.t('panel.news.pauseTicker');
    const resume = i18n.t('panel.news.resumeTicker');
    expect(pause).not.toBe(i18n.getFixedT('en')('panel.news.pauseTicker'));
    expect(resume).not.toBe(i18n.getFixedT('en')('panel.news.resumeTicker'));
    fireEvent.click(screen.getByRole('button', { name: pause }));
    expect(screen.getByRole('button', { name: resume })).toBeTruthy();
  });

  it('returns null when no news data', async () => {
    const mod = await import('../../hooks/useNewsDigest.js');
    vi.spyOn(mod, 'useNewsDigest').mockReturnValue({
      data: undefined,
      fetchedAt: null,
    } as unknown as ReturnType<typeof mod.useNewsDigest>);

    const { container } = render(<NewsMarquee />);
    expect(container.innerHTML).toBe('');

    vi.restoreAllMocks();
  });

  it('holds its height while the news loads only when asked to reserve space', async () => {
    const mod = await import('../../hooks/useNewsDigest.js');
    vi.spyOn(mod, 'useNewsDigest').mockReturnValue({
      data: undefined,
      fetchedAt: null,
      isPending: true,
    } as unknown as ReturnType<typeof mod.useNewsDigest>);

    const { container, rerender } = render(<NewsMarquee reserveSpace />);
    const placeholder = container.firstElementChild;
    expect(placeholder?.classList.contains('h-9')).toBe(true);
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true');

    rerender(<NewsMarquee />);
    expect(container.innerHTML).toBe('');

    vi.restoreAllMocks();
  });
});
