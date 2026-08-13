import { describe, expect, it } from 'vitest';

import {
  UnmanagedScheduleError,
  planScheduleReconciliation,
  reconcileJobSchedules,
  type DesiredSchedule,
} from '../scheduler.js';
import { FakeQueue } from './fakes.js';

const MANAGED = ['ai-alerts.evaluate', 'ai-observability.rollup'];

const alerts: DesiredSchedule = {
  id: 'ai-alerts.evaluate',
  cadence: { every: 300_000 },
  jobName: 'evaluate-alerts',
};

const rollup: DesiredSchedule = {
  id: 'ai-observability.rollup',
  cadence: { pattern: '0 3 * * *', tz: 'UTC' },
  jobName: 'rollup',
};

describe('planScheduleReconciliation', () => {
  it('registers a schedule that Redis does not hold yet', () => {
    const plan = planScheduleReconciliation({
      desired: [alerts],
      existing: [],
      managedIds: MANAGED,
    });

    expect(plan.upsert.map((s) => s.id)).toEqual(['ai-alerts.evaluate']);
    expect(plan.unchanged).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('leaves an identical schedule untouched rather than re-registering it', () => {
    const plan = planScheduleReconciliation({
      desired: [alerts],
      existing: [{ key: 'ai-alerts.evaluate', name: 'evaluate-alerts', every: 300_000 }],
      managedIds: MANAGED,
    });

    expect(plan.upsert).toEqual([]);
    expect(plan.unchanged).toEqual(['ai-alerts.evaluate']);
  });

  it('treats an `every` that came back from Redis as a string as equal', () => {
    const plan = planScheduleReconciliation({
      desired: [alerts],
      existing: [{ key: 'ai-alerts.evaluate', name: 'evaluate-alerts', every: '300000' }],
      managedIds: MANAGED,
    });

    expect(plan.unchanged).toEqual(['ai-alerts.evaluate']);
  });

  it('re-registers when the interval changed', () => {
    const plan = planScheduleReconciliation({
      desired: [alerts],
      existing: [{ key: 'ai-alerts.evaluate', name: 'evaluate-alerts', every: 60_000 }],
      managedIds: MANAGED,
    });

    expect(plan.upsert.map((s) => s.id)).toEqual(['ai-alerts.evaluate']);
    expect(plan.remove).toEqual([]);
  });

  it('re-registers when an interval schedule became a cron schedule', () => {
    const plan = planScheduleReconciliation({
      desired: [rollup],
      existing: [{ key: 'ai-observability.rollup', name: 'rollup', every: 3_600_000 }],
      managedIds: MANAGED,
    });

    expect(plan.upsert.map((s) => s.id)).toEqual(['ai-observability.rollup']);
  });

  it('re-registers when only the timezone changed', () => {
    const plan = planScheduleReconciliation({
      desired: [rollup],
      existing: [
        {
          key: 'ai-observability.rollup',
          name: 'rollup',
          pattern: '0 3 * * *',
          tz: 'Australia/Sydney',
        },
      ],
      managedIds: MANAGED,
    });

    expect(plan.upsert.map((s) => s.id)).toEqual(['ai-observability.rollup']);
  });

  it('removes a managed schedule whose gate has since been turned off', () => {
    const plan = planScheduleReconciliation({
      desired: [alerts],
      existing: [
        { key: 'ai-alerts.evaluate', name: 'evaluate-alerts', every: 300_000 },
        { key: 'ai-observability.rollup', name: 'rollup', pattern: '0 3 * * *', tz: 'UTC' },
      ],
      managedIds: MANAGED,
    });

    expect(plan.remove).toEqual(['ai-observability.rollup']);
    expect(plan.unchanged).toEqual(['ai-alerts.evaluate']);
  });

  it('never removes a schedule another owner registered on the same queue', () => {
    const plan = planScheduleReconciliation({
      desired: [],
      existing: [{ key: 'someone-elses.job', name: 'other', every: 1000 }],
      managedIds: MANAGED,
    });

    expect(plan.remove).toEqual([]);
  });

  it('rejects a desired schedule outside the managed id set', () => {
    expect(() =>
      planScheduleReconciliation({
        desired: [{ id: 'undeclared', cadence: { every: 1000 }, jobName: 'x' }],
        existing: [],
        managedIds: MANAGED,
      })
    ).toThrow(UnmanagedScheduleError);
  });
});

describe('reconcileJobSchedules', () => {
  it('is idempotent — a second run against the same queue changes nothing', async () => {
    const queue = new FakeQueue('ai.maintenance');

    const first = await reconcileJobSchedules(queue, {
      desired: [alerts, rollup],
      managedIds: MANAGED,
    });
    const second = await reconcileJobSchedules(queue, {
      desired: [alerts, rollup],
      managedIds: MANAGED,
    });

    expect(first.upserted).toEqual(['ai-alerts.evaluate', 'ai-observability.rollup']);
    expect(second.upserted).toEqual([]);
    expect(second.unchanged).toEqual(['ai-alerts.evaluate', 'ai-observability.rollup']);
    expect(await queue.getJobSchedulers()).toHaveLength(2);
  });

  it('replaces a changed cadence in place instead of adding a second schedule', async () => {
    const queue = new FakeQueue('ai.maintenance');
    await reconcileJobSchedules(queue, { desired: [alerts], managedIds: MANAGED });

    await reconcileJobSchedules(queue, {
      desired: [{ ...alerts, cadence: { every: 60_000 } }],
      managedIds: MANAGED,
    });

    const schedules = await queue.getJobSchedulers();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.every).toBe(60_000);
  });

  it('removes before it upserts, so a renamed schedule never doubles up', async () => {
    const queue = new FakeQueue('ai.maintenance');
    queue.seedSchedule({ key: 'ai-observability.rollup', name: 'rollup', every: 3_600_000 });

    await reconcileJobSchedules(queue, { desired: [alerts], managedIds: MANAGED });

    expect(queue.schedulerCalls).toEqual([
      'remove:ai-observability.rollup',
      'upsert:ai-alerts.evaluate',
    ]);
  });
});
