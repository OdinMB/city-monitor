import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('runs independent startup jobs in parallel', async () => {
    const callOrder: string[] = [];

    const makeHandler = (name: string, delay: number) =>
      vi.fn(async () => {
        callOrder.push(`${name}-start`);
        await new Promise((r) => setTimeout(r, delay));
        callOrder.push(`${name}-end`);
      });

    const jobA = makeHandler('a', 30);
    const jobB = makeHandler('b', 30);
    const jobC = makeHandler('c', 30);

    const jobs: ScheduledJob[] = [
      { name: 'a', schedule: '*/10 * * * *', handler: jobA, runOnStart: true },
      { name: 'b', schedule: '*/10 * * * *', handler: jobB, runOnStart: true },
      { name: 'c', schedule: '*/10 * * * *', handler: jobC, runOnStart: true },
    ];

    createScheduler(jobs);
    await new Promise((r) => setTimeout(r, 100));

    // All three should start before any of them ends (parallel execution)
    const aStart = callOrder.indexOf('a-start');
    const bStart = callOrder.indexOf('b-start');
    const cStart = callOrder.indexOf('c-start');
    const aEnd = callOrder.indexOf('a-end');

    expect(bStart).toBeLessThan(aEnd);
    expect(cStart).toBeLessThan(aEnd);
    expect(aStart).toBeLessThan(aEnd);
  });

  it('respects dependsOn — dependent job waits for its dependency', async () => {
    const callOrder: string[] = [];

    const feedsHandler = vi.fn(async () => {
      callOrder.push('feeds-start');
      await new Promise((r) => setTimeout(r, 50));
      callOrder.push('feeds-end');
    });

    const summarizeHandler = vi.fn(async () => {
      callOrder.push('summarize-start');
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push('summarize-end');
    });

    const weatherHandler = vi.fn(async () => {
      callOrder.push('weather-start');
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push('weather-end');
    });

    const jobs: ScheduledJob[] = [
      { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: feedsHandler, runOnStart: true },
      { name: 'summarize-news', schedule: '*/10 * * * *', handler: summarizeHandler, runOnStart: true, dependsOn: ['ingest-feeds'] },
      { name: 'ingest-weather', schedule: '*/30 * * * *', handler: weatherHandler, runOnStart: true },
    ];

    createScheduler(jobs);
    await new Promise((r) => setTimeout(r, 200));

    // Weather should start in parallel with feeds (both have no unmet deps)
    const _feedsStart = callOrder.indexOf('feeds-start');
    const feedsEnd = callOrder.indexOf('feeds-end');
    const weatherStart = callOrder.indexOf('weather-start');
    const summarizeStart = callOrder.indexOf('summarize-start');

    // Weather starts before feeds finishes (parallel)
    expect(weatherStart).toBeLessThan(feedsEnd);
    // Summarize starts only after feeds finishes
    expect(summarizeStart).toBeGreaterThan(feedsEnd);
  });

  it('skips overlapping runs when previous invocation is still running', async () => {
    let callCount = 0;
    let resolveFirst: (() => void) | null = null;

    const handler = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        // First invocation: block until manually resolved
        await new Promise<void>((resolve) => { resolveFirst = resolve; });
      }
    });

    const jobs: ScheduledJob[] = [
      { name: 'slow-job', schedule: '*/10 * * * *', handler, runOnStart: true },
    ];

    const scheduler = createScheduler(jobs);
    await new Promise((r) => setTimeout(r, 10));

    // First invocation should be running
    expect(handler).toHaveBeenCalledOnce();
    const jobInfo = scheduler.getJobs().find((j) => j.name === 'slow-job');
    expect(jobInfo?.running).toBe(true);

    // Trigger the cron callback manually — should be skipped
    const { default: nodeCron } = await import('node-cron');
    const scheduleCall = vi.mocked(nodeCron.schedule).mock.calls[0];
    const cronCallback = scheduleCall![1] as () => Promise<void>;
    await cronCallback();

    // handler should still only have been called once (overlap skipped)
    expect(handler).toHaveBeenCalledOnce();

    // Resolve the first invocation
    resolveFirst!();
    await new Promise((r) => setTimeout(r, 10));
    expect(jobInfo?.running).toBe(false);
  });

  it('tracks last failure in job info', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));

    const jobs: ScheduledJob[] = [
      { name: 'failing-job', schedule: '*/10 * * * *', handler, runOnStart: true },
    ];

    const scheduler = createScheduler(jobs);
    await new Promise((r) => setTimeout(r, 50));

    const jobInfo = scheduler.getJobs().find((j) => j.name === 'failing-job');
    expect(jobInfo?.lastFailure).not.toBeNull();
    expect(jobInfo?.lastRun).toBeNull(); // lastRun only updated on success
  });

  it('runs heavy startup jobs one at a time, light ones alongside', async () => {
    let heavyActive = 0;
    let maxHeavy = 0;
    const order: string[] = [];
    const heavy = (name: string) => vi.fn(async () => {
      heavyActive++;
      maxHeavy = Math.max(maxHeavy, heavyActive);
      order.push(`${name}-start`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`${name}-end`);
      heavyActive--;
    });
    const light = vi.fn(async () => { order.push('light'); });

    createScheduler([
      { name: 'h1', schedule: '* * * * *', handler: heavy('h1'), runOnStart: true, heavy: true },
      { name: 'h2', schedule: '* * * * *', handler: heavy('h2'), runOnStart: true, heavy: true },
      { name: 'h3', schedule: '* * * * *', handler: heavy('h3'), runOnStart: true, heavy: true },
      { name: 'l', schedule: '* * * * *', handler: light, runOnStart: true },
    ]);
    await new Promise((r) => setTimeout(r, 150));

    expect(maxHeavy).toBe(1);
    expect(order.filter((e) => e !== 'light')).toEqual(['h1-start', 'h1-end', 'h2-start', 'h2-end', 'h3-start', 'h3-end']);
    // The light job did not wait for the heavy queue
    expect(order.indexOf('light')).toBeLessThan(order.indexOf('h1-end'));
  });

  it('keeps startup runs to the concurrency limit, and heavy jobs waiting for the lock hold no slot', async () => {
    let active = 0;
    let maxActive = 0;
    const started: string[] = [];
    const job = (name: string, heavy = false): ScheduledJob => ({
      name, schedule: '* * * * *', runOnStart: true, heavy,
      handler: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        started.push(name);
        await new Promise((r) => setTimeout(r, 20));
        active--;
      },
    });

    createScheduler([job('h1', true), job('h2', true), job('h3', true), job('a'), job('b'), job('c')], { startupConcurrency: 2 });
    await new Promise((r) => setTimeout(r, 200));
    expect(maxActive).toBe(2);
    expect(started).toHaveLength(6);
    // h2 and h3 wait for the heavy lock without taking a slot, so the light jobs are not starved behind them
    expect(started.indexOf('c')).toBeLessThan(started.indexOf('h3'));
  });

  it('serialises a heavy cron run behind a heavy startup run', async () => {
    let release: (() => void) | null = null;
    const order: string[] = [];
    const slow = vi.fn(async () => {
      order.push('slow-start');
      await new Promise<void>((r) => { release = r; });
      order.push('slow-end');
    });
    const other = vi.fn(async () => { order.push('other'); });

    createScheduler([
      { name: 'slow', schedule: '* * * * *', handler: slow, runOnStart: true, heavy: true },
      { name: 'other', schedule: '* * * * *', handler: other, heavy: true },
    ]);
    await new Promise((r) => setTimeout(r, 10));

    const { default: nodeCron } = await import('node-cron');
    const otherCron = vi.mocked(nodeCron.schedule).mock.calls[1]![1] as () => Promise<void>;
    const run = otherCron();
    await new Promise((r) => setTimeout(r, 10));
    expect(other).not.toHaveBeenCalled();

    release!();
    await run;
    expect(order).toEqual(['slow-start', 'slow-end', 'other']);
  });

  it('keeps the heavy queue going after a heavy job fails', async () => {
    const after = vi.fn().mockResolvedValue(undefined);
    createScheduler([
      { name: 'bad', schedule: '* * * * *', handler: vi.fn().mockRejectedValue(new Error('boom')), runOnStart: true, heavy: true },
      { name: 'after', schedule: '* * * * *', handler: after, runOnStart: true, heavy: true },
    ]);
    await new Promise((r) => setTimeout(r, 20));
    expect(after).toHaveBeenCalledOnce();
  });

  it('handles errors in dependency — dependent still runs', async () => {
    const feedsHandler = vi.fn().mockRejectedValue(new Error('feeds failed'));
    const summarizeHandler = vi.fn().mockResolvedValue(undefined);

    const jobs: ScheduledJob[] = [
      { name: 'ingest-feeds', schedule: '*/10 * * * *', handler: feedsHandler, runOnStart: true },
      { name: 'summarize-news', schedule: '*/10 * * * *', handler: summarizeHandler, runOnStart: true, dependsOn: ['ingest-feeds'] },
    ];

    createScheduler(jobs);
    await new Promise((r) => setTimeout(r, 100));

    // Both should have been called — summarize runs even if feeds fails
    expect(feedsHandler).toHaveBeenCalledOnce();
    expect(summarizeHandler).toHaveBeenCalledOnce();
  });
});
