import cron, { type ScheduledTask } from 'node-cron';
import { createLogger } from './logger.js';

const log = createLogger('scheduler');

export interface ScheduledJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  runOnStart?: boolean;
  /** Names of jobs that must complete before this job's startup run. */
  dependsOn?: string[];
  /**
   * Downloads or parses a large file (tens of MB, or a spreadsheet). Heavy jobs
   * run one at a time — at startup, on cron and when triggered — so their
   * heap peaks never add up: the 256 MB heap of a 512 MB instance ran out when
   * a fresh start ran them all at once (2026-11).
   */
  heavy?: boolean;
}

/** A FIFO lock: each call runs after every earlier call has settled. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** Runs at most `limit` calls at a time, the rest in the order they came. */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

/**
 * How many startup runs may be in flight at once. A fresh instance finds
 * most of its 40-odd jobs stale; all at once, their responses and parse
 * results were alive together and the heap ran out within 8 seconds.
 */
export const STARTUP_CONCURRENCY = 4;

export interface JobInfo {
  name: string;
  schedule: string;
  lastRun: Date | null;
  lastFailure: Date | null;
  running: boolean;
  nextRun: string | null;
}

export interface SchedulerOptions {
  /** Startup runs in flight at once (default `STARTUP_CONCURRENCY`). */
  startupConcurrency?: number;
}

export function createScheduler(jobs: ScheduledJob[], options: SchedulerOptions = {}) {
  const jobInfos: JobInfo[] = [];
  const tasks: ScheduledTask[] = [];
  const heavyQueue = createSerialQueue();
  /** A job's handler, behind the heavy-job lock when it is heavy. */
  const exec = (job: ScheduledJob, run: () => Promise<void> = job.handler): Promise<void> =>
    job.heavy ? heavyQueue(run) : run();

  for (const job of jobs) {
    const info: JobInfo = {
      name: job.name,
      schedule: job.schedule,
      lastRun: null,
      lastFailure: null,
      running: false,
      nextRun: job.schedule,
    };
    jobInfos.push(info);

    const task = cron.schedule(job.schedule, async () => {
      if (info.running) {
        log.warn(`${job.name}: still running, skipping overlapping invocation`);
        return;
      }
      info.running = true;
      try {
        await exec(job);
        info.lastRun = new Date();
      } catch (err) {
        info.lastFailure = new Date();
        log.error(`${job.name} failed`, err);
      } finally {
        info.running = false;
      }
    });
    tasks.push(task);
  }

  // Run startup jobs in parallel up to the concurrency limit, heavy ones one
  // at a time, respecting dependsOn ordering: a dependent job starts once all
  // its dependencies have completed (or failed).
  const limit = createLimiter(options.startupConcurrency ?? STARTUP_CONCURRENCY);
  // A heavy job takes the heavy lock before a slot, so heavy jobs waiting
  // for the lock never hold slots the light jobs could use
  runStartupJobs(jobs, jobInfos, (job) => exec(job, () => limit(job.handler)));

  function getJobs(): JobInfo[] {
    return jobInfos;
  }

  function stop(): void {
    for (const task of tasks) {
      task.stop();
    }
  }

  async function triggerJob(name: string): Promise<boolean> {
    const idx = jobs.findIndex((j) => j.name === name);
    if (idx < 0) return false;
    const job = jobs[idx];
    const info = jobInfos[idx];
    if (info.running) return false;
    info.running = true;
    try {
      await exec(job);
      info.lastRun = new Date();
    } catch (err) {
      info.lastFailure = new Date();
      log.error(`${job.name} (manual) failed`, err);
    } finally {
      info.running = false;
    }
    return true;
  }

  return { getJobs, stop, triggerJob };
}

function runStartupJobs(jobs: ScheduledJob[], jobInfos: JobInfo[], run: (job: ScheduledJob) => Promise<void>): void {
  const startupJobs = jobs.filter((j) => j.runOnStart);
  if (startupJobs.length === 0) return;

  const resolvers = new Map<string, () => void>();

  // Create a promise for each startup job that resolves when it completes
  const completionPromises = new Map<string, Promise<void>>();
  for (const job of startupJobs) {
    completionPromises.set(job.name, new Promise<void>((resolve) => {
      resolvers.set(job.name, resolve);
    }));
  }

  for (const job of startupJobs) {
    for (const dep of job.dependsOn ?? []) {
      if (!completionPromises.has(dep)) {
        log.warn(`${job.name}: dependency "${dep}" is not a runOnStart job — ignored`);
      }
    }
  }

  function depsReady(job: ScheduledJob): Promise<unknown[]> {
    const deps = (job.dependsOn ?? [])
      .filter((name) => completionPromises.has(name));
    return Promise.all(deps.map((name) => completionPromises.get(name)!));
  }

  // Launch all jobs — each waits for its own dependencies first
  for (const job of startupJobs) {
    (async () => {
      await depsReady(job);
      const info = jobInfos.find((j) => j.name === job.name);
      if (info) info.running = true;
      try {
        await run(job);
        if (info) info.lastRun = new Date();
      } catch (err) {
        if (info) info.lastFailure = new Date();
        log.error(`${job.name} (startup) failed`, err);
      } finally {
        if (info) info.running = false;
        resolvers.get(job.name)?.();
      }
    })();
  }
}

export type Scheduler = ReturnType<typeof createScheduler>;
