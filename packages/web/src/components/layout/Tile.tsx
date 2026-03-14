import { type ReactNode, useState, useRef, useEffect } from 'react';

type TileSpan = 1 | 2 | 'full';
type TileRowSpan = 1 | 2;
type TileHeight = 'auto' | 'sm' | 'md' | 'lg';

interface TileProps {
  title: string;
  titleBadge?: ReactNode;
  span?: TileSpan;
  rowSpan?: TileRowSpan;
  height?: TileHeight;
  expandable?: boolean;
  defaultExpanded?: boolean;
  children: ReactNode | ((expanded: boolean, setExpanded: (v: boolean) => void) => ReactNode);
  className?: string;
  /** Stagger index for reveal animation (set by DashboardGrid) */
  revealIndex?: number;
}

const HEIGHT_CLASSES: Record<TileHeight, string> = {
  auto: '',
  sm: 'max-h-64 overflow-y-auto',
  md: 'max-h-96 overflow-y-auto',
  lg: 'max-h-[32rem] overflow-y-auto',
};

const SPAN_CLASSES: Record<TileSpan, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  full: 'col-span-full',
};

const ROW_SPAN_CLASSES: Record<TileRowSpan, string> = {
  1: '',
  2: 'xl:row-span-2',
};

export function Tile({ title, titleBadge, span = 1, rowSpan = 1, height = 'auto', expandable, defaultExpanded, children, className, revealIndex = 0 }: TileProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  // Reveal on scroll via IntersectionObserver
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Guard: IntersectionObserver not available (SSR / jsdom)
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const delay = Math.min(revealIndex * 80, 800);

  return (
    <div
      ref={ref}
      className={`col-span-1 ${SPAN_CLASSES[span]} ${ROW_SPAN_CLASSES[rowSpan]} flex flex-col rounded-lg border border-border bg-surface-1 card-glow overflow-hidden tile-reveal ${revealed ? 'tile-revealed' : ''} hover:scale-[1.01] hover:shadow-md transition-[transform,box-shadow] duration-200 ease-out ${className ?? ''}`}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
    >
      {expandable ? (
        <button
          type="button"
          className="w-full px-4 py-3 border-b border-border-subtle flex items-center justify-between cursor-pointer select-none appearance-none bg-transparent text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`${title} — ${expanded ? 'collapse' : 'expand'}`}
        >
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {title}{titleBadge}
          </h2>
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-gray-400 dark:text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {title}{titleBadge}
          </h2>
        </div>
      )}
      <div className={`@container p-4 flex-1 flex flex-col ${HEIGHT_CLASSES[height]}`}>
        {typeof children === 'function' ? children(expanded, setExpanded) : children}
      </div>
    </div>
  );
}
