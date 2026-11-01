import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { WebCityConfig } from '@city-monitor/shared';
import i18n from 'i18next';
import { CityProvider } from '../../hooks/CityProvider.js';
import { berlin } from '../../config/cities/berlin.js';
import { hamburg } from '../../config/cities/hamburg.js';
import { CitySwitcher } from './CitySwitcher.js';

function LocationProbe() {
  return <output data-testid="pathname">{useLocation().pathname}</output>;
}

function renderSwitcher(cities: WebCityConfig[], path = '/berlin', props: { hideWhenAlone?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CityProvider cityId="berlin">
        <CitySwitcher cities={cities} placement="test" {...props} />
        <button type="button">elsewhere</button>
      </CityProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** Two switchers on one page, as the top bar and the map's sidebar have them. */
function renderTwoSwitchers() {
  return render(
    <MemoryRouter initialEntries={['/berlin']}>
      <CityProvider cityId="berlin">
        <div data-testid="first">
          <CitySwitcher cities={[berlin, hamburg]} placement="first" />
        </div>
        <div data-testid="second">
          <CitySwitcher cities={[berlin, hamburg]} placement="second" />
        </div>
      </CityProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** The trigger: its accessible name starts with the city it shows. */
const trigger = (city = 'Berlin') => screen.getByRole('button', { name: new RegExp(`^${city}`) });

function open(): HTMLElement {
  const button = trigger();
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  const list = document.getElementById(button.getAttribute('aria-controls') ?? '');
  if (!list) throw new Error('city list did not open');
  return list;
}

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('CitySwitcher with one active city', () => {
  it('shows the plain city name, with nothing to open', () => {
    renderSwitcher([berlin]);
    expect(screen.getByText('BERLIN')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Berlin/ })).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows nothing at all where it is asked to hide alone', () => {
    renderSwitcher([berlin], '/berlin', { hideWhenAlone: true });
    expect(screen.queryByText('BERLIN')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('CitySwitcher with several active cities', () => {
  it('shows its menu where it is asked to hide alone', () => {
    renderSwitcher([berlin, hamburg], '/berlin', { hideWhenAlone: true });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('starts closed, showing the current city on its button', () => {
    renderSwitcher([berlin, hamburg]);
    const button = trigger();
    expect(button.textContent).toContain('BERLIN');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('lists every active city, linking each to its dashboard and marking the current one', () => {
    renderSwitcher([berlin, hamburg]);
    const list = open();
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Berlin', '/berlin'],
      ['Hamburg', '/hamburg'],
    ]);
    expect(links.map((l) => l.getAttribute('aria-current'))).toEqual(['page', null]);
  });

  it('keeps the sub-page the visitor is on', () => {
    renderSwitcher([berlin, hamburg], '/berlin/sources');
    const links = within(open()).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/berlin/sources', '/hamburg/sources']);
  });

  it('closes with Escape and gives focus back to its button', () => {
    renderSwitcher([berlin, hamburg]);
    const list = open();
    const link = within(list).getByRole('link', { name: 'Hamburg' });
    link.focus();
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a press outside, leaving focus where the person pressed', () => {
    renderSwitcher([berlin, hamburg]);
    open();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }));
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).not.toBe(trigger());
  });

  it('closes when keyboard focus moves past the list', () => {
    renderSwitcher([berlin, hamburg]);
    const list = open();
    const last = within(list).getByRole('link', { name: 'Hamburg' });
    last.focus();
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
    fireEvent.blur(last, { relatedTarget: elsewhere });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open while focus moves within it', () => {
    renderSwitcher([berlin, hamburg]);
    const list = open();
    const [first, second] = within(list).getAllByRole('link');
    fireEvent.blur(trigger(), { relatedTarget: first });
    fireEvent.blur(first!, { relatedTarget: second });
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('goes to the chosen city, closes, and keeps focus on its button each time', () => {
    renderSwitcher([berlin, hamburg]);
    const choose = (name: string) => {
      const link = within(open()).getByRole('link', { name });
      link.focus();
      fireEvent.click(link);
    };

    choose('Hamburg');
    expect(screen.getByTestId('pathname').textContent).toBe('/hamburg');
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.activeElement).toBe(trigger());

    // A second choice without a remount (the current city here) must not drop focus either.
    choose('Berlin');
    expect(screen.getByTestId('pathname').textContent).toBe('/berlin');
    expect(document.activeElement).toBe(trigger());
  });

  it('keeps the sliding top bar on screen while its list is open', () => {
    renderSwitcher([berlin, hamburg]);
    expect(trigger().hasAttribute('data-popover-pinned')).toBe(false);
    open();
    expect(trigger().hasAttribute('data-popover-pinned')).toBe(true);
  });
});

describe('two CitySwitchers on one page', () => {
  const triggerIn = (testId: string) =>
    within(screen.getByTestId(testId)).getByRole('button', { name: /^Berlin/ });

  it('open and close independently, each controlling its own list', () => {
    renderTwoSwitchers();
    fireEvent.click(triggerIn('first'));
    expect(triggerIn('second').getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(triggerIn('second'));
    const ids = [triggerIn('first'), triggerIn('second')].map((b) => b.getAttribute('aria-controls'));
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
    expect(within(screen.getByTestId('first')).getAllByRole('link')).toHaveLength(2);
    expect(within(screen.getByTestId('second')).getAllByRole('link')).toHaveLength(2);
  });

  it.each(['first', 'second'])('gives focus back to the %s switcher after a switch made with it', (used) => {
    renderTwoSwitchers();
    fireEvent.click(triggerIn(used));
    const link = within(screen.getByTestId(used)).getByRole('link', { name: 'Hamburg' });
    link.focus();
    fireEvent.click(link);
    expect(screen.getByTestId('pathname').textContent).toBe('/hamburg');
    expect(document.activeElement).toBe(triggerIn(used));
  });
});
