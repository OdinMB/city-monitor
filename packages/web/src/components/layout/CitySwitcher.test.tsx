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

function renderSwitcher(cities: WebCityConfig[], path = '/berlin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CityProvider cityId="berlin">
        <CitySwitcher cities={cities} />
        <button type="button">elsewhere</button>
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
});

describe('CitySwitcher with several active cities', () => {
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
