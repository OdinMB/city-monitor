import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { CityProvider } from '../../hooks/CityProvider.js';
import { MobileLayerDrawer } from './MobileLayerDrawer.js';

// The drawer slides in from the inline start: the left edge in left-to-right
// languages, the right edge in Arabic. jsdom does no layout, so these check
// where the sliding block is anchored and which way it is moved.

async function renderDrawer(lang: 'en' | 'ar') {
  await i18n.changeLanguage(lang);
  render(
    <div dir={i18n.dir(lang)}>
      <CityProvider cityId="berlin">
        <MobileLayerDrawer />
      </CityProvider>
    </div>,
  );
  const handle = screen.getByRole('button', { name: i18n.t('sidebar.toggleLayers') });
  const slider = handle.parentElement!;
  return { handle, slider };
}

function drag(el: HTMLElement, fromX: number, toX: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: fromX, clientY: 100 }] });
  // The first move past 8px only decides the gesture is horizontal.
  fireEvent.touchMove(el, { touches: [{ clientX: fromX + Math.sign(toX - fromX) * 10, clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: toX, clientY: 100 }] });
  fireEvent.touchEnd(el);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('MobileLayerDrawer', () => {
  it('is anchored at the inline start, so in Arabic it sits at the right edge', async () => {
    const { slider } = await renderDrawer('ar');
    expect(slider.classList.contains('inset-s-0')).toBe(true);
    expect(slider.classList.contains('left-0')).toBe(false);
  });

  it('keeps the layers button on screen when closed: the panel is pushed out past the start edge', async () => {
    const en = await renderDrawer('en');
    expect(en.slider.style.transform).toBe('translateX(-200px)');
    cleanup();

    const ar = await renderDrawer('ar');
    // Pushed left in Arabic it left only the panel's edge on screen and the
    // button off it.
    expect(ar.slider.style.transform).toBe('translateX(200px)');
  });

  it('opens in place with the button in either direction', async () => {
    const { handle, slider } = await renderDrawer('ar');
    fireEvent.click(handle);
    expect(slider.style.transform).toBe('translateX(0px)');
    fireEvent.click(handle);
    expect(slider.style.transform).toBe('translateX(200px)');
  });

  it('opens on a swipe away from the start edge: rightwards in English, leftwards in Arabic', async () => {
    const en = await renderDrawer('en');
    drag(en.slider, 20, 170);
    expect(en.slider.style.transform).toBe('translateX(0px)');
    cleanup();

    const ar = await renderDrawer('ar');
    drag(ar.slider, 370, 220);
    expect(ar.slider.style.transform).toBe('translateX(0px)');
  });

  it('stays closed on a swipe towards the start edge in Arabic', async () => {
    const { slider } = await renderDrawer('ar');
    drag(slider, 220, 370);
    expect(slider.style.transform).toBe('translateX(200px)');
  });
});

describe('MobileLayerDrawer while closed and on closing', () => {
  // The closed panel is pushed off screen; inert takes it out of the Tab order
  // and the accessibility tree too. jsdom does not apply inert, so these check
  // the attribute and where focus is sent.
  const panelOf = (handle: HTMLElement) => document.getElementById(handle.getAttribute('aria-controls')!)!;

  it('keeps the closed panel out of the Tab order and the accessibility tree', async () => {
    const { handle } = await renderDrawer('en');
    const panel = panelOf(handle);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(handle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(handle);
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(handle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(handle);
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(handle.getAttribute('aria-expanded')).toBe('false');
  });

  it('moves focus into the panel when it opens', async () => {
    const { handle } = await renderDrawer('en');
    handle.focus();
    fireEvent.click(handle);
    expect(panelOf(handle).contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the layers button when Escape closes it', async () => {
    const { handle } = await renderDrawer('en');
    fireEvent.click(handle);
    const inside = document.activeElement as HTMLElement;
    expect(panelOf(handle).contains(inside)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panelOf(handle).hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(handle);
  });

  it('stays open when Escape belongs to a modal dialog on top of it', async () => {
    const { handle } = await renderDrawer('en');
    fireEvent.click(handle);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    const inModal = document.createElement('button');
    modal.appendChild(inModal);
    document.body.appendChild(modal);
    inModal.focus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panelOf(handle).hasAttribute('inert')).toBe(false);
    modal.remove();
  });

  it('returns focus to the layers button when the backdrop closes it with focus inside', async () => {
    const { handle } = await renderDrawer('ar');
    fireEvent.click(handle);
    const backdrop = handle.closest('.absolute.inset-0')!.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(panelOf(handle).hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(handle);
  });

  it('returns focus to the layers button when a swipe closes it with focus inside', async () => {
    const { handle, slider } = await renderDrawer('en');
    fireEvent.click(handle);
    expect(panelOf(handle).contains(document.activeElement)).toBe(true);
    drag(slider, 170, 20);
    expect(slider.style.transform).toBe('translateX(-200px)');
    expect(document.activeElement).toBe(handle);
  });
});
