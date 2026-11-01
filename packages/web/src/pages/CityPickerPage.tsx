import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WebCityConfig } from '@city-monitor/shared';
import { PageShell } from '../components/layout/PageShell.js';
import { CitySkyline } from '../components/skylines/CitySkyline.js';
import { cityTopics } from '../lib/city-topics.js';

/**
 * The home page while more than one city is active (App.tsx): a tile per city,
 * each one link to its dashboard. A tile carries its city's `data-city`, so it
 * takes that city's accent colour in either theme (globals.css).
 */
export function CityPickerPage({ cities }: { cities: WebCityConfig[] }) {
  const { t, i18n } = useTranslation();
  const title = t('cityPicker.title');

  useEffect(() => {
    document.title = title;
  }, [title]);

  const list = new Intl.ListFormat(i18n.language, { type: 'conjunction' });
  const summary = (city: WebCityConfig) => {
    const { count, highlights } = cityTopics(city.features);
    return t('cityPicker.summary', {
      topics: t('cityPicker.topics', { count }),
      highlights: list.format(highlights.map((key) => t(key))),
    });
  };

  return (
    <PageShell>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-base text-gray-600 dark:text-gray-400">{t('cityPicker.intro')}</p>
      {/* Stacked on phones, two side by side from sm up. */}
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {cities.map((city) => (
          <li key={city.id}>
            <Link
              to={`/${city.id}`}
              data-city={city.id}
              className="flex flex-col h-full overflow-hidden rounded-xl border border-border bg-surface-1 shadow-sm transition-shadow hover:shadow-md hover:border-[var(--accent)]"
            >
              <div className="flex-1 p-5">
                <h2 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
                  {city.name}
                </h2>
                <p className="mt-1 text-sm text-muted">{summary(city)}</p>
              </div>
              {/* True proportions in any tile width: scaled by the height alone, the sides
                  cropped (or the top, in a tile wider than ten times its height). Never
                  preserveAspectRatio="none", which squashes it into a narrow tile. */}
              <svg aria-hidden="true" viewBox="0 0 1200 120" preserveAspectRatio="xMidYMax slice" className="block w-full h-12">
                <CitySkyline cityId={city.id} fill="var(--accent)" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
