import { describe, it, expect } from 'vitest';
import { createBudget, BudgetExceededError } from './budget.js';

const estimates = () => new Map([['news:a', 0.4], ['news:b', 0.4], ['news:fallback', 0.5]]);

describe('createBudget', () => {
  it('refuses to start when prior spend plus the whole estimate exceeds the cap', () => {
    expect(() => createBudget({ capUsd: 1.2, priorUsd: 0, estimates: estimates() }).checkTotal()).toThrow(BudgetExceededError);
    expect(() => createBudget({ capUsd: 1.3, priorUsd: 0, estimates: estimates() }).checkTotal()).not.toThrow();
    expect(() => createBudget({ capUsd: 1.3, priorUsd: 0.2, estimates: estimates() }).checkTotal()).toThrow(BudgetExceededError);
  });

  it('re-checks before each arm with actual spend plus the remaining estimate', () => {
    const budget = createBudget({ capUsd: 1.4, priorUsd: 0, estimates: estimates() });
    budget.startArm('news:a'); // 0 + 1.3 estimated
    budget.record(0.45);
    expect(() => budget.startArm('news:b')).not.toThrow(); // 0.45 spent + 0.9 remaining
    budget.record(0.5);
    expect(() => budget.startArm('news:fallback')).toThrow(BudgetExceededError); // 0.95 spent + 0.5 > 1.4
  });

  it('drops the estimate of arms that will not run', () => {
    const budget = createBudget({ capUsd: 1.0, priorUsd: 0, estimates: estimates() });
    budget.skip(['news:fallback']);
    expect(() => budget.checkTotal()).not.toThrow();
  });

  it('counts calls and spend', () => {
    const budget = createBudget({ capUsd: 5, priorUsd: 0, estimates: estimates() });
    budget.record(0.01);
    budget.record(0.02);
    expect(budget.calls).toBe(2);
    expect(budget.spentUsd).toBeCloseTo(0.03);
  });
});
