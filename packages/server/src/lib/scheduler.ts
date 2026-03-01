/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import cron from 'node-cron';

export interface ScheduledJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  runOnStart?: boolean;
}

export interface JobInfo {
  name: string;
  schedule: string;
  lastRun: Date | null;
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
      nextRun: job.schedule,
    };
    jobInfos.push(info);

    const task = cron.schedule(job.schedule, async () => {
      try {
        await job.handler();
        info.lastRun = new Date();
      } catch (err) {
        console.error(`[scheduler] ${job.name} failed:`, err);
      }
    });
    tasks.push(task);

    if (job.runOnStart) {
      job.handler().then(() => {
        info.lastRun = new Date();
      }).catch((err) => {
        console.error(`[scheduler] ${job.name} (startup) failed:`, err);
      });
    }
  }

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

export type Scheduler = ReturnType<typeof createScheduler>;
