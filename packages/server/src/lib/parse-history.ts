/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Parse a `?history=7d` or `?history=30d` query param into days.
 *  Returns null if absent or invalid. Caps at maxDays. */
export function parseHistoryDays(raw: unknown, maxDays: number): number | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d+)d$/.exec(raw);
  if (!match) return null;
  const days = Number(match[1]);
  if (days < 1 || days > maxDays) return null;
  return days;
}
