import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCityConfig } from '../../config/index.js';

export function Footer() {
  const { t } = useTranslation();
  const { cityId } = useParams<{ cityId: string }>();
  const city = cityId ? getCityConfig(cityId) : null;

  return (
    <footer className="px-4 py-3 text-xs text-gray-400 border-t border-border flex justify-between gap-4">
      <nav aria-label="Footer" className="flex flex-col sm:flex-row gap-1 sm:gap-4">
        <a href="https://github.com/OdinMB/city-monitor" target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t('footer.sourceCode')}
        </a>
        <a href="https://worldmonitor.io" target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t('footer.inspiredBy')}
        </a>
        <span>{t('footer.license')}</span>
        <a href="https://ko-fi.com/OdinMB" target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t('support.title')}
        </a>
      </nav>
      <nav aria-label="Legal" className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-right sm:text-left">
        {city && (
          <Link to={`/${city.id}/sources`} className="hover:underline">
            {t('footer.sources')}
          </Link>
        )}
        <Link to="/imprint" className="hover:underline">
          {t('footer.imprint')}
        </Link>
        <Link to="/privacy" className="hover:underline">
          {t('footer.privacy')}
        </Link>
        <Link to="/no-ads-no-tracking" className="hover:underline">
          {t('footer.noTracking')}
        </Link>
      </nav>
    </footer>
  );
}
