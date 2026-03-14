import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAllCities } from '../../config/index.js';

export function CityPicker() {
  const { t } = useTranslation();
  const cities = getAllCities();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-0 px-4">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
        {t('app.title')}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 w-full max-w-md">
        {cities.map((city) => (
          <Link
            key={city.id}
            to={`/${city.id}`}
            className="block rounded-lg border border-border p-6 text-center hover:shadow-lg transition-shadow bg-surface-1 card-glow"
            style={{ borderTopColor: city.theme.accent, borderTopWidth: 4 }}
          >
            <span className="text-xl font-semibold" style={{ color: city.theme.accent }}>
              {city.name}
            </span>
            <span className="block text-sm text-gray-500 dark:text-gray-400 mt-1">
              {city.country}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
