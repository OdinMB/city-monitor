import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from 'i18next';
import { useTabKeys } from './useTabKeys.js';

const TABS = ['first', 'second', 'third'];

function Tabs() {
  const [active, setActive] = useState(1);
  const { setTabRef, onKeyDown } = useTabKeys(TABS.length, active, setActive);
  return (
    <div role="tablist">
      {TABS.map((name, i) => (
        <button key={name} ref={setTabRef(i)} role="tab" aria-selected={active === i} tabIndex={active === i ? 0 : -1} onKeyDown={onKeyDown}>
          {name}
        </button>
      ))}
    </div>
  );
}

function press(key: string): string {
  fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key });
  return screen.getByRole('tab', { selected: true }).textContent!;
}

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('useTabKeys', () => {
  it('moves right to the next tab in a left-to-right language', () => {
    render(<Tabs />);
    expect(press('ArrowRight')).toBe('third');
    expect(press('ArrowLeft')).toBe('second');
    expect(press('Home')).toBe('first');
    expect(press('End')).toBe('third');
  });

  it('moves left to the next tab in Arabic, where tabs run right to left', async () => {
    await i18n.changeLanguage('ar');
    render(<Tabs />);
    expect(press('ArrowLeft')).toBe('third');
    expect(press('ArrowRight')).toBe('second');
    expect(press('ArrowRight')).toBe('first');
    expect(press('ArrowRight')).toBe('third');
  });

  it('moves focus with the selection', () => {
    render(<Tabs />);
    press('ArrowRight');
    expect(document.activeElement?.textContent).toBe('third');
  });
});
