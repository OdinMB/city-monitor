/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import cron from 'node-cron';
import { createLogger } from './logger.js';

const log = createLogger('scheduler');

export interface ScheduledJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  runOnStart?: boolean;
  /** Names of jobs that must complete before this job's startup run. */
  dependsOn?: string[];
}

export interface JobInfo {
  name: string;
  schedule: string;
  lastRun: Date | null;
  lastFailure: Date | null;
  running: boolean;
  nextRun: string | null;
}

export function createScheduler(jobs: ScheduledJob[]) {
  const jobInfos: JobInfo[] = [];
  const tasks: cron.ScheduledTask[] = [];

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
        await job.handler();
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

  // Run startup jobs in parallel, respecting dependsOn ordering.
  // Jobs with no unmet dependencies start immediately; dependent jobs
  // start as soon as all their dependencies have completed (or failed).
  runStartupJobs(jobs, jobInfos);

  function getJobs(): JobInfo[] {
    return jobInfos;
  }

  function stop(): void {
    for (const task of tasks) {
      task.stop();
    }
  }

  return { getJobs, stop };
}

function runStartupJobs(jobs: ScheduledJob[], jobInfos: JobInfo[]): void {
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
        await job.handler();
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
