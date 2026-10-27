import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { CityProvider } from '../../hooks/CityProvider.js';
import { HeaderControls } from './HeaderControls.js';

// Berlin offers DE, EN, TR and AR. The inline buttons (desktop) and the
// hamburger menu (phones) both render here: jsdom applies no stylesheet, so
// the lg:hidden / hidden lg:flex split does not hide either.
function renderControls(dir: 'ltr' | 'rtl' = 'ltr') {
  return render(
    <div dir={dir}>
      <CityProvider cityId="berlin">
        <HeaderControls />
      </CityProvider>
    </div>,
  );
}

function openMenu(name: string): HTMLElement {
  const button = screen.getByRole('button', { name });
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  const panel = button.nextElementSibling;
  if (!(panel instanceof HTMLElement)) throw new Error('menu did not open');
  return panel;
}

afterEach(async () => {
  // Unmount first so the language reset does not re-render outside act().
  cleanup();
  await i18n.changeLanguage('en');
});

describe('HeaderControls phone menu', () => {
  it('opens towards the inline end, so in Arabic (RTL) it stays on screen', async () => {
    await i18n.changeLanguage('ar');
    renderControls('rtl');
    const panel = openMenu('القائمة');

    // jsdom does no layout, so check the classes. inset-e-0 is
    // inset-inline-end: 0, which anchors the panel to the button's right edge
    // in LTR and its left edge in RTL. A physical right-0 kept the right edge
    // in RTL too, where the button sits at the left of the screen, so the
    // panel ran off the left side of a phone.
    expect(panel.classList.contains('inset-e-0')).toBe(true);
    expect(panel.classList.contains('right-0')).toBe(false);
    expect(panel.classList.contains('left-0')).toBe(false);
    expect(panel.closest('[dir="rtl"]')).not.toBeNull();
  });

  it('opens the same way in a left-to-right language', () => {
    renderControls();
    const panel = openMenu('Menu');
    expect(panel.classList.contains('inset-e-0')).toBe(true);
  });

  it('does not call itself a menu, since its buttons are not menu items', () => {
    renderControls();
    openMenu('Menu');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('HeaderControls language buttons', () => {
  it('mark the current language as pressed, inline and in the menu', () => {
    renderControls();
    openMenu('Menu');

    const pressed = screen.getAllByRole('button', { pressed: true });
    expect(pressed.map((b) => b.textContent)).toEqual(['EN', 'EN']);
    const notPressed = screen.getAllByRole('button', { pressed: false });
    expect(notPressed.map((b) => b.textContent)).toEqual(['DE', 'TR', 'AR', 'DE', 'TR', 'AR']);
  });

  it('move the mark to the language just chosen', async () => {
    renderControls();
    fireEvent.click(screen.getAllByRole('button', { name: 'Language: TR' })[0]);

    await waitFor(() => {
      const pressed = screen.getAllByRole('button', { pressed: true });
      expect(pressed.map((b) => b.textContent)).toEqual(['TR']);
    });
    expect(i18n.language).toBe('tr');
  });
});
