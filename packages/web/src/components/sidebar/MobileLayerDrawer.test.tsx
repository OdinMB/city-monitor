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
