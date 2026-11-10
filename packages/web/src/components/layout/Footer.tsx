import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCityConfig } from '../../config/index.js';
import { SUPPORT_URL } from '../../lib/constants.js';
import wordmarkSvg from '../../assets/simple-analytics-wordmark.svg?raw';

// Simple Analytics' free plan asks for its badge on pages people visit, checked
// about monthly; a missing badge locks the dashboard. This is their self-hosted
// text link (https://www.simpleanalytics.com/badges), styled like the other
// footer links: no third-party request, no CSP change, and the footer's font,
// size, line height and colour, so it follows dark mode. Keep the href exactly
// as it is (utm_source and utm_content=badge are how they detect it) and the
// wordmark unedited; its sizing is `.sa-wordmark` in globals.css.
export const SIMPLE_ANALYTICS_BADGE_URL =
  'https://www.simpleanalytics.com/?utm_source=citymonitor.app&utm_content=badge';

// English and untranslated, so lang="en". The inner span is isolated as LTR:
// otherwise an Arabic page moves the "by" and the wordmark to the far side.
function SimpleAnalyticsCredit() {
  return (
    <a href={SIMPLE_ANALYTICS_BADGE_URL} referrerPolicy="origin" target="_blank" lang="en" className="hover:underline">
      <span dir="ltr">
        privacy-first analytics by{' '}
        <span className="sa-wordmark" dangerouslySetInnerHTML={{ __html: wordmarkSvg }} />
      </span>
    </a>
  );
}

export function Footer() {
  const { t } = useTranslation();
  const { cityId } = useParams<{ cityId: string }>();
  const city = cityId ? getCityConfig(cityId) : null;

  // Sits on bg-surface-0. gray-500 is the lightest gray with 4.5:1 there in
  // light mode (gray-400 is about 2.5:1); dark mode keeps gray-400 (about 7:1).
  return (
    <footer className="px-4 py-3 text-xs text-muted border-t border-border flex justify-between gap-4">
      <nav aria-label={t('footer.navLabel')} className="flex flex-col sm:flex-row gap-1 sm:gap-4">
        <a href="https://github.com/OdinMB/city-monitor" target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t('footer.sourceCode')}
        </a>
        <a href="https://worldmonitor.io" target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t('footer.inspiredBy')}
        </a>
        <span>{t('footer.license')}</span>
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t('support.title')}
        </a>
      </nav>
      <nav aria-label={t('footer.legalLabel')} className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-end sm:text-start">
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
        <SimpleAnalyticsCredit />
      </nav>
    </footer>
  );
}
