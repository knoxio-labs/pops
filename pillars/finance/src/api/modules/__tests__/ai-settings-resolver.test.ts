/**
 * Unit tests for the AI settings resolver (POPS-2589): the precedence ladder
 * (setting > env var > fallback) every AI call site in finance now shares,
 * and the cache that keeps a per-row read cheap.
 *
 * `getBulk` is spied on (real implementation, not stubbed) so the "reads the
 * store at most once across N calls" assertion is measuring the actual
 * database round trip the categorizer's per-row path would otherwise pay.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBulkSpy = vi.hoisted(() => vi.fn());
vi.mock('@pops/pillar-settings/service', async () => {
  const actual = await vi.importActual<typeof import('@pops/pillar-settings/service')>(
    '@pops/pillar-settings/service'
  );
  return {
    ...actual,
    getBulk: (...args: Parameters<typeof actual.getBulk>) => {
      getBulkSpy(...args);
      return actual.getBulk(...args);
    },
  };
});

import { setBulk } from '@pops/pillar-settings/service';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '../../../db/index.js';

const { resolveAiMaxTokens, resolveAiString, invalidateAiSettingsCache } =
  await import('../ai-settings-resolver.js');

const SETTING_KEY = 'finance.aiCategorizer.model';
const MAX_TOKENS_KEY = 'finance.aiCategorizer.maxTokens';
const ENV_VAR = 'FINANCE_AI_CATEGORIZER_MODEL_TEST';

let tmpDir: string;
let opened: OpenedFinanceDb;
let db: FinanceDb;

beforeEach(() => {
  getBulkSpy.mockClear();
  invalidateAiSettingsCache();
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-settings-resolver-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
  db = opened.db;
});

afterEach(() => {
  delete process.env[ENV_VAR];
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveAiString — precedence ladder', () => {
  it('falls back to the compiled default when neither a setting nor an env var is present', () => {
    expect(resolveAiString(db, SETTING_KEY, ENV_VAR, 'compiled-default')).toBe('compiled-default');
  });

  it('prefers the env var over the compiled default when only the env var is set', () => {
    process.env[ENV_VAR] = 'env-model';
    expect(resolveAiString(db, SETTING_KEY, ENV_VAR, 'compiled-default')).toBe('env-model');
  });

  it('prefers the stored setting over both the env var and the compiled default', () => {
    process.env[ENV_VAR] = 'env-model';
    setBulk(db, [{ key: SETTING_KEY, value: 'setting-model' }]);
    invalidateAiSettingsCache();
    expect(resolveAiString(db, SETTING_KEY, ENV_VAR, 'compiled-default')).toBe('setting-model');
  });

  it('treats a stored empty string as unset and falls through to the env var', () => {
    setBulk(db, [{ key: SETTING_KEY, value: '' }]);
    invalidateAiSettingsCache();
    process.env[ENV_VAR] = 'env-model';
    expect(resolveAiString(db, SETTING_KEY, ENV_VAR, 'compiled-default')).toBe('env-model');
  });
});

describe('resolveAiMaxTokens — precedence ladder', () => {
  it('falls back to the compiled default when nothing is set', () => {
    expect(resolveAiMaxTokens(db, MAX_TOKENS_KEY, undefined, 200)).toBe(200);
  });

  it('prefers a valid stored setting over the default', () => {
    setBulk(db, [{ key: MAX_TOKENS_KEY, value: '512' }]);
    invalidateAiSettingsCache();
    expect(resolveAiMaxTokens(db, MAX_TOKENS_KEY, undefined, 200)).toBe(512);
  });

  it('falls back to the default when the stored value is not a positive integer', () => {
    setBulk(db, [{ key: MAX_TOKENS_KEY, value: 'not-a-number' }]);
    invalidateAiSettingsCache();
    expect(resolveAiMaxTokens(db, MAX_TOKENS_KEY, undefined, 200)).toBe(200);
  });
});

describe('cache — one settings round trip per cached read', () => {
  it('reads the store at most once across N resolver calls sharing one cache generation', () => {
    for (let i = 0; i < 25; i++) {
      resolveAiString(db, SETTING_KEY, undefined, 'compiled-default');
      resolveAiMaxTokens(db, MAX_TOKENS_KEY, undefined, 200);
    }
    expect(getBulkSpy).toHaveBeenCalledTimes(1);
  });

  it('reads the store again after invalidateAiSettingsCache — the save-to-read seam', () => {
    resolveAiString(db, SETTING_KEY, undefined, 'compiled-default');
    expect(getBulkSpy).toHaveBeenCalledTimes(1);

    setBulk(db, [{ key: SETTING_KEY, value: 'updated-model' }]);
    invalidateAiSettingsCache();

    expect(resolveAiString(db, SETTING_KEY, undefined, 'compiled-default')).toBe('updated-model');
    expect(getBulkSpy).toHaveBeenCalledTimes(2);
  });
});

describe('cache — keyed by database handle (POPS-2589)', () => {
  it('two FinanceDb handles in the same process resolve their own stored setting', () => {
    const otherTmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-settings-resolver-test-other-'));
    const otherOpened = openFinanceDb(join(otherTmpDir, 'finance.db'));
    try {
      setBulk(db, [{ key: SETTING_KEY, value: 'model-for-db-one' }]);
      setBulk(otherOpened.db, [{ key: SETTING_KEY, value: 'model-for-db-two' }]);
      invalidateAiSettingsCache();

      expect(resolveAiString(db, SETTING_KEY, undefined, 'compiled-default')).toBe(
        'model-for-db-one'
      );
      expect(resolveAiString(otherOpened.db, SETTING_KEY, undefined, 'compiled-default')).toBe(
        'model-for-db-two'
      );
    } finally {
      otherOpened.raw.close();
      rmSync(otherTmpDir, { recursive: true, force: true });
    }
  });

  it('invalidateAiSettingsCache still clears every handle, so a save on one is visible', () => {
    const otherTmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-settings-resolver-test-other-'));
    const otherOpened = openFinanceDb(join(otherTmpDir, 'finance.db'));
    try {
      expect(resolveAiString(db, SETTING_KEY, undefined, 'compiled-default')).toBe(
        'compiled-default'
      );
      expect(resolveAiString(otherOpened.db, SETTING_KEY, undefined, 'compiled-default')).toBe(
        'compiled-default'
      );

      setBulk(otherOpened.db, [{ key: SETTING_KEY, value: 'updated-on-db-two' }]);
      invalidateAiSettingsCache();

      expect(resolveAiString(otherOpened.db, SETTING_KEY, undefined, 'compiled-default')).toBe(
        'updated-on-db-two'
      );
    } finally {
      otherOpened.raw.close();
      rmSync(otherTmpDir, { recursive: true, force: true });
    }
  });
});
