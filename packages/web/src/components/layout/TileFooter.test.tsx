import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { TileFooter } from './TileFooter';

afterEach(async () => {
  cleanup(); // unmount first, so the language reset doesn't re-render outside act()
  await i18n.changeLanguage('en');
});

describe('TileFooter', () => {
  it('marks stale data with a word, not only a colour', () => {
    render(<TileFooter stale>Updated 3h ago</TileFooter>);
    expect(screen.getByText('Updated 3h ago')).toBeTruthy();
    expect(screen.getByText('· outdated')).toBeTruthy();
  });

  it('adds no stale word for fresh data', () => {
    render(<TileFooter>Updated 3h ago</TileFooter>);
    expect(screen.queryByText(/outdated/)).toBeNull();
  });

  it('shows the stale word in the reader\'s language', async () => {
    await i18n.changeLanguage('de');
    render(<TileFooter stale>Aktualisiert vor 3 Std.</TileFooter>);
    expect(screen.getByText('· veraltet')).toBeTruthy();
  });
});
