import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from 'i18next';
import { CrisisStrip } from './CrisisStrip.js';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

/** Phone links with the text of their left-to-right isolate, if any. */
function phoneLinks(): Array<{ href: string; ltr: string | null }> {
  return screen.getAllByRole('link')
    .filter((a) => a.getAttribute('href')?.startsWith('tel:'))
    .map((a) => ({ href: a.getAttribute('href')!, ltr: a.querySelector('bdi[dir="ltr"]')?.textContent ?? null }));
}

describe('CrisisStrip phone numbers in Arabic (right-to-left)', () => {
  it('keeps every city-wide hotline number left-to-right', async () => {
    await i18n.changeLanguage('ar');
    render(<CrisisStrip expanded onExpand={() => {}} />);
    const links = phoneLinks();
    expect(links).toHaveLength(9);
    expect(links).toContainEqual({ href: 'tel:08001110111', ltr: '0800 111 0 111' });
    expect(links).toContainEqual({ href: 'tel:0303906390', ltr: '030 390 63-90' });
    for (const link of links) expect(link.ltr).not.toBeNull();
  });

  it('keeps the regional crisis service numbers left-to-right', async () => {
    await i18n.changeLanguage('ar');
    render(<CrisisStrip expanded onExpand={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'محلي' }));
    const links = phoneLinks();
    expect(links).toHaveLength(9);
    expect(links.map((l) => l.ltr)).toContain('030 390 63-10');
    for (const link of links) expect(link.ltr).not.toBeNull();
  });

  it('names the hidden services in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<CrisisStrip expanded={false} onExpand={() => {}} />);
    expect(screen.getByRole('button', { name: '5 أخرى' })).toBeTruthy();
  });
});
