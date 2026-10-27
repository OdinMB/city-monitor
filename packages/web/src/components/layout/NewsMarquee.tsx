import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { safeUrl } from '../../lib/safe-url.js';
import type { NewsItem } from '../../lib/api.js';

/**
 * Scrolling news ticker showing latest headlines in a continuous loop.
 * It pauses while the pointer is over the headlines or one of them has
 * keyboard focus, and its pause button stops it until pressed again (WCAG
 * 2.2.2). Under prefers-reduced-motion it stands still and scrolls by hand
 * instead (globals.css, `.marquee-track`). The headlines are German feed
 * text, so the scrolling area runs left to right in every language: in an
 * Arabic page they still come in from the right, start first.
 * `reserveSpace` keeps an empty bar of the same height in place while the news
 * is still loading, so the layout below it doesn't jump when the news arrives.
 */
export function NewsMarquee({ reserveSpace = false }: { reserveSpace?: boolean }) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const { data, isPending } = useNewsDigest(cityId);
  const [paused, setPaused] = useState(false);

  const items = data?.items?.slice(0, 10);
  if (!items?.length) {
    return reserveSpace && isPending ? (
      <div className="h-9 bg-surface-1 border-b border-border" aria-hidden="true" />
    ) : null;
  }

  // No gap between the copies: each carries its own trailing space (pe-8), so
  // half the track is exactly one copy and the loop has no jump. The second
  // copy is for the eye only: hidden from screen readers and out of the Tab
  // order, but still clickable, since it is on screen half the time.
  return (
    <div
      className={`bg-surface-1 border-b border-border text-base text-gray-700 dark:text-gray-300 h-9 flex items-center marquee-container ${paused ? 'marquee-paused' : ''}`}
    >
      <div
        dir="ltr"
        role="marquee"
        aria-live="off"
        aria-label={t('panel.news.headlines')}
        className="marquee-viewport flex-1 min-w-0 h-full flex items-center overflow-hidden"
      >
        <div className="marquee-track flex">
          <div className="marquee-content flex gap-8 pe-8 shrink-0">
            <Headlines items={items} />
          </div>
          <div className="marquee-content flex gap-8 pe-8 shrink-0" aria-hidden="true">
            <Headlines items={items} loopCopy />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((v) => !v)}
        aria-label={paused ? t('panel.news.resumeTicker') : t('panel.news.pauseTicker')}
        title={paused ? t('panel.news.resumeTicker') : t('panel.news.pauseTicker')}
        className="marquee-toggle shrink-0 w-6 h-6 mx-2 flex items-center justify-center rounded text-muted hover:text-gray-900 dark:hover:text-gray-100 hover:bg-surface-2 cursor-pointer transition-colors"
      >
        {/* Media symbols keep their shape in a right-to-left page. */}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          {paused ? <path d="M7 4.5v15l12.5-7.5z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
        </svg>
      </button>
    </div>
  );
}

/** Source and headline come from the feeds (German); each sits in a <bdi> so the words keep their order. */
function Headlines({ items, loopCopy = false }: { items: NewsItem[]; loopCopy?: boolean }) {
  return items.map((item) => (
    <a
      key={item.id}
      href={safeUrl(item.url)}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={loopCopy ? -1 : undefined}
      className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-[var(--accent)] transition-colors"
    >
      <bdi className="text-muted text-xs">{item.sourceName}</bdi>
      <bdi>{item.title}</bdi>
    </a>
  ));
}
