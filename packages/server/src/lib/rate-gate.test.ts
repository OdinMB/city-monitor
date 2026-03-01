/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { createRateGate } from './rate-gate.js';

describe('createRateGate', () => {
  it('enforces minimum gap between calls', async () => {
    const gate = createRateGate(50); // 50ms gap
    const times: number[] = [];

    for (let i = 0; i < 3; i++) {
      await gate();
      times.push(Date.now());
    }

    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(45); // allow 5ms jitter
    }
  });

  it('does not delay if enough time has passed', async () => {
    const gate = createRateGate(10);
    await gate();
    await new Promise((r) => setTimeout(r, 20));
    const start = Date.now();
    await gate();
    expect(Date.now() - start).toBeLessThan(15);
  });
});
