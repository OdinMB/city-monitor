import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { safeUrl } from '../../lib/safe-url.js';

/**
 * Scrolling news ticker showing latest headlines in a continuous loop.
 * Pauses on hover, respects prefers-reduced-motion, and runs towards the
 * inline end, so rightwards in Arabic (globals.css, `.marquee-track`).
 * `reserveSpace` keeps an empty bar of the same height in place while the news
 * is still loading, so the layout below it doesn't jump when the news arrives.
 */
export function NewsMarquee({ reserveSpace = false }: { reserveSpace?: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, isPending } = useNewsDigest(cityId);

  const items = data?.items?.slice(0, 10);
  if (!items?.length) {
    return reserveSpace && isPending ? (
      <div className="h-9 bg-surface-1 border-b border-border" aria-hidden="true" />
    ) : null;
  }

  // Duplicate items for seamless loop. Source and headline come from the feeds
  // (German); each sits in a <bdi> so an Arabic page doesn't reorder its words.
  const headlines = items.map((item) => (
    <a
      key={item.id}
      href={safeUrl(item.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-[var(--accent)] transition-colors"
    >
      <bdi className="text-gray-400 dark:text-gray-500 text-xs">{item.sourceName}</bdi>
      <bdi>{item.title}</bdi>
    </a>
  ));

  // No gap between the copies: each carries its own trailing space (pe-8), so
  // half the track is exactly one copy and the loop has no jump.
  return (
    <div
      className="overflow-hidden bg-surface-1 border-b border-border text-base text-gray-700 dark:text-gray-300 h-9 flex items-center marquee-container"
      role="marquee"
      aria-live="off"
    >
      <div className="marquee-track flex">
        <div className="marquee-content flex gap-8 pe-8 shrink-0" aria-hidden="false">
          {headlines}
        </div>
        <div className="marquee-content flex gap-8 pe-8 shrink-0" aria-hidden="true">
          {headlines}
        </div>
      </div>
    </div>
  );
}
