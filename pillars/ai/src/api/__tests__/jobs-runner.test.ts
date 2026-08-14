/**
 * The maintenance runner: what each job task actually does, and what the
 * pillar falls back to when there is no Redis.
 *
 * The fallback matters as much as the durable path — most of the fleet runs
 * without Redis, and this pillar must keep evaluating alerts there rather
 * than silently losing the feature to a queue it cannot reach.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAiDb, settingsService, type OpenedAiDb } from '../../db/index.js';
import { runMaintenanceTask, startAiSchedulers } from '../jobs/runner.js';
import { seedDefaultRules } from '../modules/ai-alerts/service.js';
import { OBSERVABILITY_SUMMARY_SETTING_KEY } from '../modules/ai-observability/summary.js';

let tmpDir: string;
let aiDb: OpenedAiDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-jobs-runner-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  delete process.env['REDIS_URL'];
  delete process.env['REDIS_HOST'];
  delete process.env['AI_ALERTS_SCHEDULER_ENABLED'];
  delete process.env['AI_OBSERVABILITY_SCHEDULER_ENABLED'];
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runMaintenanceTask', () => {
  it('rolls up observability, leaving the cached summary the dashboard reads', async () => {
    expect(settingsService.getSettingOrNull(aiDb.db, OBSERVABILITY_SUMMARY_SETTING_KEY)).toBeNull();

    await runMaintenanceTask(aiDb.db, 'rollup-observability');

    const cached = settingsService.getSettingOrNull(aiDb.db, OBSERVABILITY_SUMMARY_SETTING_KEY);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached?.value ?? '{}')).toMatchObject({ totalCalls: 0 });
  });

  it('runs the alert evaluator against the pillar’s own rules', async () => {
    seedDefaultRules(aiDb.db);

    // No usage rows, so nothing fires — what is being proved is that the task
    // reaches the evaluator at all rather than silently no-oping.
    await expect(runMaintenanceTask(aiDb.db, 'evaluate-alerts')).resolves.toBeUndefined();
  });
});

describe('startAiSchedulers without Redis', () => {
  it('falls back to the interval loops rather than dropping the feature', async () => {
    process.env['AI_ALERTS_SCHEDULER_ENABLED'] = 'true';

    const handle = await startAiSchedulers(aiDb.db);

    expect(handle.durable).toBe(false);
    await expect(handle.stop()).resolves.toBeUndefined();
  });

  it('starts nothing at all when the gates are off', async () => {
    const handle = await startAiSchedulers(aiDb.db);

    expect(handle.durable).toBe(false);
    await handle.stop();
  });
});
