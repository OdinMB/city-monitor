import { useEffect, useState } from 'react';
import type { WeatherAlert } from '@city-monitor/shared';
import { nextWarningExpiry, warningsInForce } from '../lib/weather-warnings.js';

/** Longest single wait; a later expiry is reached in several (setTimeout overflows past ~24.8 days). */
const MAX_WAIT_MS = 6 * 3_600_000;

/**
 * The weather warnings still in force (`warningsInForce`), checked again when
 * the next one runs out, so a page left open drops a warning without new data.
 */
export function useWarningsInForce(alerts: WeatherAlert[]): WeatherAlert[] {
  const [now, setNow] = useState(Date.now);
  const inForce = warningsInForce(alerts, now);
  const next = nextWarningExpiry(inForce);

  useEffect(() => {
    if (next === null) return;
    const wait = Math.min(Math.max(next - Date.now(), 0), MAX_WAIT_MS);
    const id = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(id);
  }, [next, now]);

  return inForce;
}
