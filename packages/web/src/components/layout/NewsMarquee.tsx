import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';

/**
 * Scrolling news ticker showing latest headlines in a continuous loop.
 * Pauses on hover, respects prefers-reduced-motion.
 */
export function NewsMarquee() {
  const { id: cityId } = useCityConfig();
  const { data } = useNewsDigest(cityId);

  const items = data?.items?.slice(0, 10);
  if (!items?.length) return null;

  // Duplicate items for seamless loop
  const headlines = items.map((item) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-[var(--accent)] transition-colors"
    >
      <span className="text-gray-400 dark:text-gray-500 text-xs">{item.sourceName}</span>
      <span>{item.title}</span>
    </a>
  ));

  return (
    <div
      className="overflow-hidden bg-surface-1 border-b border-border text-base text-gray-700 dark:text-gray-300 h-9 flex items-center marquee-container"
      role="marquee"
      aria-live="off"
    >
      <div className="marquee-track flex gap-8">
        <div className="marquee-content flex gap-8 shrink-0" aria-hidden="false">
          {headlines}
        </div>
        <div className="marquee-content flex gap-8 shrink-0" aria-hidden="true">
          {headlines}
        </div>
      </div>
    </div>
  );
}
