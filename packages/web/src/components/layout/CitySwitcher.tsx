import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WebCityConfig } from '@city-monitor/shared';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { citySwitchPath } from '../../lib/city-path.js';

/** Whether the router state is the one a city link carries (`fromCitySwitcher`). */
const cameFromSwitcher = (state: unknown) =>
  typeof state === 'object' && state !== null && 'fromCitySwitcher' in state;

const NAME_CLASSES = 'text-lg font-bold';
const ACCENT = { color: 'var(--accent)' };

interface CitySwitcherProps {
  /** The active cities (`getAllCities()`). With only one, the plain name shows. */
  cities: WebCityConfig[];
  /** Placement in the top bar. */
  className?: string;
}

/**
 * The top bar's city name. With several active cities it is a button that
 * opens a list of them, each a link to the same page of that city where every
 * city has it, else its dashboard. A disclosure (button and links), not an
 * ARIA menu: the items are plain links, reached with Tab.
 */
export function CitySwitcher({ cities, className = '' }: CitySwitcherProps) {
  const current = useCityConfig();
  if (cities.length < 2) {
    return (
      <span className={`${NAME_CLASSES} ${className}`} style={ACCENT}>
        {current.name.toUpperCase()}
      </span>
    );
  }
  return <CityList cities={cities} className={className} />;
}

function CityList({ cities, className }: Required<CitySwitcherProps>) {
  const current = useCityConfig();
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // A switch mounts the new city's page afresh (App.tsx), so focus would be
  // lost with the old one: put it back on this button, without scrolling.
  useEffect(() => {
    if (cameFromSwitcher(location.state)) buttonRef.current?.focus({ preventScroll: true });
  }, [location.state]);

  useEffect(() => {
    if (!open) return;
    // A press outside closes the list and leaves focus where the person pressed.
    function handlePointerDown(e: PointerEvent) {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <nav
      ref={rootRef}
      aria-label={t('topbar.city.list')}
      className={className}
      onBlur={(e) => {
        // Tab past the last city closes the list.
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t('topbar.city.switch', { city: current.name })}
        // The list hangs from the sliding top bar: keep the bar on screen while it is open (globals.css).
        data-popover-pinned={open ? '' : undefined}
        className={`${NAME_CLASSES} inline-flex items-center gap-1 px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer`}
        style={ACCENT}
      >
        {current.name.toUpperCase()}
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {/* As wide as the button, or as its longest city name: lined up under the
          button in either direction, with no physical side. */}
      {open && (
        <ul
          id={listId}
          className="absolute top-full inset-x-0 mt-1 min-w-max p-1 bg-surface-1 border border-border rounded-lg shadow-lg z-50"
        >
          {cities.map((city) => {
            const isCurrent = city.id === current.id;
            return (
              <li key={city.id}>
                <Link
                  to={citySwitchPath(location.pathname, city.id)}
                  // A new object per render, so choosing the current city twice
                  // still changes the state and runs the focus effect above.
                  state={{ fromCitySwitcher: true }}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-1.5 text-sm rounded ${
                    isCurrent ? 'bg-gray-200 dark:bg-gray-700 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {city.name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
