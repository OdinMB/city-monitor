/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton.js';

interface PanelProps {
  title: string;
  lastUpdated?: string | null;
  isLoading?: boolean;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, lastUpdated, isLoading, children, className }: PanelProps) {
  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden ${className || ''}`}
    >
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {lastUpdated && (
          <time className="text-xs text-gray-400">{lastUpdated}</time>
        )}
      </div>
      <div className="p-4">{isLoading ? <Skeleton /> : children}</div>
    </div>
  );
}
