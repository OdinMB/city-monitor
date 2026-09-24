/**
 * API spend accounting for the model eval: the cumulative spend log and the
 * guard that stops a run before it can exceed the project's cap.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface SpendEntry {
  startedAt: string;
  mode: 'full' | 'smoke' | 'briefing-check';
  estimateUsd: number;
  actualUsd: number;
  calls: number;
}

export async function readSpendLog(file: string): Promise<SpendEntry[]> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as SpendEntry[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function appendSpendLog(file: string, entry: SpendEntry): Promise<void> {
  const entries = await readSpendLog(file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify([...entries, entry], null, 2), 'utf8');
}

export class BudgetExceededError extends Error {
  override name = 'BudgetExceededError';
}

export interface Budget {
  /** Before the first call: prior spend + the whole estimate must fit the cap. */
  checkTotal(): void;
  /** Before each arm: prior + actual so far + every arm not yet started must fit. */
  startArm(key: string): void;
  /** Arms that will not run (e.g. fallbacks after a winner) leave the estimate. */
  skip(keys: readonly string[]): void;
  record(costUsd: number): void;
  readonly spentUsd: number;
  readonly calls: number;
}

export function createBudget(opts: { capUsd: number; priorUsd: number; estimates: ReadonlyMap<string, number> }): Budget {
  const remaining = new Map(opts.estimates);
  let spentUsd = 0;
  let calls = 0;

  const check = (what: string) => {
    const projected = opts.priorUsd + spentUsd + [...remaining.values()].reduce((sum, v) => sum + v, 0);
    if (projected > opts.capUsd + 1e-9) {
      throw new BudgetExceededError(
        `${what}: spent so far $${(opts.priorUsd + spentUsd).toFixed(4)} + remaining estimate would reach $${projected.toFixed(4)}, over the $${opts.capUsd.toFixed(2)} cap`,
      );
    }
  };

  return {
    checkTotal: () => check('before the first call'),
    startArm(key) {
      check(`before ${key}`);
      remaining.delete(key);
    },
    skip(keys) {
      for (const key of keys) remaining.delete(key);
    },
    record(costUsd) {
      spentUsd += costUsd;
      calls++;
    },
    get spentUsd() {
      return spentUsd;
    },
    get calls() {
      return calls;
    },
  };
}
