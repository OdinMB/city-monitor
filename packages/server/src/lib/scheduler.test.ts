/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler, type ScheduledJob } from './scheduler.js';

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({ stop: vi.fn() })),
  },
}));

describe('Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers jobs and calls runOnStart handlers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const jobs: ScheduledJob[] = [
      { name: 'test-job', schedule: '*/10 * * * *', handler, runOnStart: true },
    ];

    const scheduler = createScheduler(jobs);
    // Wait for runOnStart to execute
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledOnce();
    expect(scheduler.getJobs()).toHaveLength(1);
    expect(scheduler.getJobs()[0]!.name).toBe('test-job');
  });

  it('does not call handler on start when runOnStart is false', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const jobs: ScheduledJob[] = [
      { name: 'lazy-job', schedule: '*/10 * * * *', handler, runOnStart: false },
    ];

    createScheduler(jobs);
    await new Promise((r) => setTimeout(r, 10));
    expect(handler).not.toHaveBeenCalled();
  });
});
