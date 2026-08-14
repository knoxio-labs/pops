/**
 * The env gates decide what the pillar wants scheduled, and reconciliation
 * turns that into add/keep/remove. These cases pin the gate semantics — in
 * particular that a gate turned OFF produces a shorter desired set, which is
 * what makes a previously-registered schedule get removed rather than left
 * firing with nothing listening.
 */
import { describe, expect, it } from 'vitest';

import { planScheduleReconciliation } from '@pops/pillar-jobs';

import {
  AI_MANAGED_SCHEDULE_IDS,
  ALERTS_GATE_ENV,
  ALERTS_INTERVAL_MS,
  ALERTS_SCHEDULE_ID,
  OBSERVABILITY_GATE_ENV,
  OBSERVABILITY_INTERVAL_MS,
  OBSERVABILITY_SCHEDULE_ID,
  desiredAiSchedules,
} from '../jobs/schedules.js';

describe('desiredAiSchedules', () => {
  it('wants nothing while both gates are unset — off is the default', () => {
    expect(desiredAiSchedules({})).toEqual([]);
  });

  it('treats any value other than the literal "true" as off', () => {
    expect(desiredAiSchedules({ [ALERTS_GATE_ENV]: '1' })).toEqual([]);
    expect(desiredAiSchedules({ [OBSERVABILITY_GATE_ENV]: 'yes' })).toEqual([]);
  });

  it('keeps the cadences the interval loops used', () => {
    const desired = desiredAiSchedules({
      [ALERTS_GATE_ENV]: 'true',
      [OBSERVABILITY_GATE_ENV]: 'true',
    });

    expect(desired).toEqual([
      {
        id: ALERTS_SCHEDULE_ID,
        cadence: { every: ALERTS_INTERVAL_MS },
        jobName: 'evaluate-alerts',
        data: { task: 'evaluate-alerts' },
      },
      {
        id: OBSERVABILITY_SCHEDULE_ID,
        cadence: { every: OBSERVABILITY_INTERVAL_MS },
        jobName: 'rollup-observability',
        data: { task: 'rollup-observability' },
      },
    ]);
  });

  it('only declares ids the pillar manages, so reconciliation can act on them', () => {
    const desired = desiredAiSchedules({
      [ALERTS_GATE_ENV]: 'true',
      [OBSERVABILITY_GATE_ENV]: 'true',
    });

    for (const schedule of desired) {
      expect(AI_MANAGED_SCHEDULE_IDS).toContain(schedule.id);
    }
  });
});

describe('reconciliation against the gates', () => {
  const registered = [
    { key: ALERTS_SCHEDULE_ID, name: 'evaluate-alerts', every: ALERTS_INTERVAL_MS },
    {
      key: OBSERVABILITY_SCHEDULE_ID,
      name: 'rollup-observability',
      every: OBSERVABILITY_INTERVAL_MS,
    },
  ];

  it('removes the schedule of a feature whose gate was turned off', () => {
    const plan = planScheduleReconciliation({
      desired: desiredAiSchedules({ [ALERTS_GATE_ENV]: 'true' }),
      existing: registered,
      managedIds: AI_MANAGED_SCHEDULE_IDS,
    });

    expect(plan.remove).toEqual([OBSERVABILITY_SCHEDULE_ID]);
    expect(plan.unchanged).toEqual([ALERTS_SCHEDULE_ID]);
    expect(plan.upsert).toEqual([]);
  });

  it('removes both when the pillar is booted with everything off', () => {
    const plan = planScheduleReconciliation({
      desired: desiredAiSchedules({}),
      existing: registered,
      managedIds: AI_MANAGED_SCHEDULE_IDS,
    });

    expect(plan.remove).toEqual([ALERTS_SCHEDULE_ID, OBSERVABILITY_SCHEDULE_ID]);
  });

  it('changes nothing on a restart with the same gates — no duplicate schedules', () => {
    const plan = planScheduleReconciliation({
      desired: desiredAiSchedules({
        [ALERTS_GATE_ENV]: 'true',
        [OBSERVABILITY_GATE_ENV]: 'true',
      }),
      existing: registered,
      managedIds: AI_MANAGED_SCHEDULE_IDS,
    });

    expect(plan.upsert).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.unchanged).toEqual([ALERTS_SCHEDULE_ID, OBSERVABILITY_SCHEDULE_ID]);
  });
});
