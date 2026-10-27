import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { NewsMarquee } from './NewsMarquee.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

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

  it('isolates each headline and source name, so a German headline keeps its word order in Arabic', () => {
    render(<NewsMarquee />);
    const link = screen.getAllByRole('link')[0];
    const isolated = [...link.querySelectorAll('bdi')].map((el) => el.textContent);
    expect(isolated).toEqual(['Source A', 'First headline']);
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

  it('scrolls towards the inline end: leftwards in left-to-right text, rightwards in Arabic', () => {
    // jsdom applies no stylesheet, so this checks the rules themselves. A
    // right-to-left track starts at the right edge; moving it left as well
    // pushed every headline off the screen within seconds.
    const css = read('../../globals.css');
    const keyframes = css.match(/@keyframes marquee \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(keyframes).toContain('to { transform: translateX(var(--marquee-shift, -50%)); }');
    expect(css).toMatch(/\[dir='rtl'\] \.marquee-track \{\s*--marquee-shift: 50%;\s*\}/);
    // Reduced motion still stops it in both directions: the right-to-left rule
    // only sets the distance, not the animation.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.marquee-track \{\s*animation: none;/);
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
