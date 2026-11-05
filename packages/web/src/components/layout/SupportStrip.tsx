import { useTranslation } from 'react-i18next';
import { SUPPORT_URL } from '../../lib/constants.js';

const FIGURES = ['cost', 'ads', 'tracking'] as const;

/**
 * What the dashboard costs, shows and tracks (nothing) and a link to donate.
 * No tile and in no setup: TileSections shows it in every setup, after the
 * first section on screen, with no heading of its own and no setup controls.
 * One row from sm up. On a phone it is a band from edge to edge, so from
 * 360 px wide the figures fill one line and the donation the other. From sm
 * up it is larger, and the figures' words share the donation's size and weight.
 */
export function SupportStrip() {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('support.title')}
      className="col-span-full -mx-4 sm:mx-0 border-y sm:border border-border sm:rounded-lg bg-surface-1 px-3 sm:px-6 py-2 sm:py-3"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-6 sm:gap-x-10 gap-y-1">
        <ul className="flex items-baseline gap-3 sm:gap-6">
          {FIGURES.map((key) => (
            <li key={key} className="flex items-baseline gap-1 sm:gap-1.5">
              <span className="text-base sm:text-2xl font-extrabold tabular-nums text-green-700 dark:text-green-400">0</span>{' '}
              <span className="text-xs sm:text-base font-medium sm:font-bold text-muted">{t(`support.${key}`)}</span>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap items-baseline justify-center gap-x-2">
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-baseline gap-1.5 sm:gap-2 whitespace-nowrap rounded hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5 sm:size-5 shrink-0 self-center text-red-400" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="text-sm sm:text-base font-bold text-gray-700 dark:text-gray-200">
              {t('support.donate')} {t('support.cta')}
            </span>
          </a>
        </p>
      </div>
    </section>
  );
}
