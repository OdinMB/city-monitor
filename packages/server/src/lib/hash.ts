/**
 * FNV-1a 52-bit hash for deterministic cache keys.
 *
 * Adapted from World Monitor (AGPL-3.0)
 * Original: server/_shared/hash.ts
 * Copyright (C) 2024-2026 Elie Habib
 *
 * Modifications:
 * - No functional changes; same FNV-1a 52-bit algorithm
 * - Added JSDoc for city-monitor context
 */

/**
 * FNV-1a 52-bit hash — uses JS safe integer range for low collision probability.
 * At 77k keys, collision chance is ~0.00007% vs ~50% for 32-bit hashes.
 */
export function hashString(input: string): string {
  let h = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK_52 = (1n << 52n) - 1n;

  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * FNV_PRIME) & MASK_52;
  }

  return Number(h).toString(36);
}
