/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNina } from '../../hooks/useNina.js';
import type { NinaWarning } from '../../lib/api.js';

const SEVERITY_STYLES: Record<string, string> = {
  extreme: 'bg-red-600 text-white dark:bg-red-700',
  severe: 'bg-red-500 text-white dark:bg-red-600',
  moderate: 'bg-amber-500 text-white dark:bg-amber-600',
  minor: 'bg-yellow-400 text-yellow-900 dark:bg-yellow-500 dark:text-yellow-900',
};

const SEVERITY_ICONS: Record<string, string> = {
  extreme: '🚨',
  severe: '⚠️',
  moderate: '⚠️',
  minor: 'ℹ️',
};

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('nina-dismissed');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function setDismissedIds(ids: Set<string>) {
  localStorage.setItem('nina-dismissed', JSON.stringify([...ids]));
}

export function NinaBanner() {
  const { id: cityId, country } = useCityConfig();
  const { data: warnings } = useNina(cityId);
  const [dismissed, setDismissed] = useState(getDismissedIds);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      setDismissedIds(next);
      return next;
    });
  }, []);

  // Only show for German cities
  if (country !== 'DE') return null;

  const active = (warnings ?? []).filter((w) => !dismissed.has(w.id));
  if (active.length === 0) return null;

  return (
    <div className="space-y-2 mb-4" aria-live="polite">
      {active.map((warning) => (
        <NinaWarningCard key={warning.id} warning={warning} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function NinaWarningCard({ warning, onDismiss }: { warning: NinaWarning; onDismiss: (id: string) => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[warning.severity] ?? SEVERITY_STYLES.minor;
  const icon = SEVERITY_ICONS[warning.severity] ?? '';

  return (
    <div className={`rounded-lg px-4 py-3 ${style}`} role="alert">
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">{warning.headline}</div>
          <div className="text-xs opacity-80 mt-0.5">
            {warning.source.toUpperCase()} · {t(`nina.severity.${warning.severity}`, warning.severity)}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(warning.description || warning.instruction) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-white/20 text-xs"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
          <button
            onClick={() => onDismiss(warning.id)}
            className="p-1 rounded hover:bg-white/20 text-xs"
            aria-label={t('nina.dismiss', 'Dismiss')}
          >
            ✕
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 text-sm opacity-90 space-y-2">
          {warning.description && <p>{warning.description}</p>}
          {warning.instruction && (
            <p className="font-medium">{warning.instruction}</p>
          )}
        </div>
      )}
    </div>
  );
}
