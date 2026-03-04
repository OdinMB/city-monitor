import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Returns freshness info for a data source based on its fetchedAt timestamp.
 * Always returns a human-readable `agoText` (translated via `time.*` keys).
 * `isStale` is true when the data age exceeds `freshMaxAge`.
 * Re-evaluates every 60s so the label stays current.
 */
export function useFreshness(fetchedAt: string | null, freshMaxAge: number) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!fetchedAt) return { isStale: false, agoText: '' };

  const ageMs = now - new Date(fetchedAt).getTime();
  const isStale = ageMs > freshMaxAge;

  let agoText: string;
  if (ageMs < MINUTE_MS) agoText = t('time.justNow');
  else if (ageMs < HOUR_MS) agoText = t('time.minutesAgo', { count: Math.floor(ageMs / MINUTE_MS) });
  else if (ageMs < DAY_MS) agoText = t('time.hoursAgo', { count: Math.floor(ageMs / HOUR_MS) });
  else agoText = t('time.daysAgo', { count: Math.floor(ageMs / DAY_MS) });

  return { isStale, agoText };
}
