/**
 * Serial rate-gate factory for external API throttling.
 *
 * Adapted from World Monitor (AGPL-3.0)
 * Original: server/_shared/constants.ts (yahooGate)
 * Copyright (C) 2024-2026 Elie Habib
 *
 * Modifications:
 * - Generalized from Yahoo-specific to reusable factory
 * - Accepts configurable minimum gap
 */

/**
 * Creates a rate gate that enforces a minimum time gap between calls.
 * Concurrent callers are serialized — each waits for the previous to complete
 * plus the minimum gap.
 */
export function createRateGate(minGapMs: number): () => Promise<void> {
  let lastRequest = 0;
  let queue: Promise<void> = Promise.resolve();

  return () => {
    queue = queue.then(async () => {
      const elapsed = Date.now() - lastRequest;
      if (elapsed < minGapMs) {
        await new Promise<void>((r) => setTimeout(r, minGapMs - elapsed));
      }
      lastRequest = Date.now();
    });
    return queue;
  };
}
