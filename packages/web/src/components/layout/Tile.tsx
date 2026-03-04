import { type ReactNode, useState } from 'react';

type TileSpan = 1 | 2 | 'full';
type TileHeight = 'auto' | 'sm' | 'md' | 'lg';

interface TileProps {
  title: string;
  titleBadge?: ReactNode;
  span?: TileSpan;
  height?: TileHeight;
  expandable?: boolean;
  defaultExpanded?: boolean;
  children: ReactNode | ((expanded: boolean, setExpanded: (v: boolean) => void) => ReactNode);
  className?: string;
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

export function Tile({ title, titleBadge, span = 1, height = 'auto', expandable, defaultExpanded, children, className }: TileProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  return (
    <div
      className={`col-span-1 ${SPAN_CLASSES[span]} flex flex-col rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden ${className ?? ''}`}
    >
      {expandable ? (
        <button
          type="button"
          className="w-full px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between cursor-pointer select-none appearance-none bg-transparent text-left"
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
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
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
