/**
 * `generateRules` must resolve its model and max-tokens cap through the same
 * settings > env var > compiled-default ladder as `analyzeCorrection` and
 * `interpretRejectionFeedback` (POPS-2589) — it used to hardcode
 * `maxTokens: 2000` and resolve its model from env only, so an operator's
 * `finance.ruleGen.*` save never reached this call site.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setBulk } from '@pops/pillar-settings/service';

import {
  RULE_GEN_MAX_TOKENS_KEY,
  RULE_GEN_MODEL_KEY,
} from '../../../../contract/settings/ai-settings-keys.js';
import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { upsertVocabularyTag } from '../../../../db/services/tag-vocabulary.js';
import { invalidateAiSettingsCache } from '../../ai-settings-resolver.js';
import { generateRules, type GenerateRulesTransaction } from '../ai-generate-rules.js';
import { __setClaudeCompleterForTests, CORRECTIONS_DEFAULT_MODEL } from '../ai-runtime.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { ClaudeRequest } from '../ai-runtime.js';

let db: FinanceDb;
let captured: ClaudeRequest | null;

function stubCompleterCapturing(): void {
  captured = null;
  __setClaudeCompleterForTests((req) => {
    captured = req;
    return Promise.resolve('[]');
  });
}

function oneTransaction(): GenerateRulesTransaction[] {
  return [
    {
      description: 'NETFLIX.COM',
      entityName: 'Netflix',
      amount: -19.99,
      accountId: 'acc-1',
      currentTags: [],
    },
  ];
}

beforeEach(() => {
  invalidateAiSettingsCache();
  db = freshMigratedFinanceDb().db;
  upsertVocabularyTag(db, 'category:subscriptions', 'seed');
  stubCompleterCapturing();
});

afterEach(() => {
  __setClaudeCompleterForTests(null);
  delete process.env['FINANCE_CORRECTIONS_AI_MODEL'];
});

describe('generateRules — model/max-tokens resolution (POPS-2589)', () => {
  it('uses the compiled defaults when neither a setting nor an env var is present', async () => {
    await generateRules(db, oneTransaction());

    expect(captured?.model).toBe(CORRECTIONS_DEFAULT_MODEL);
    expect(captured?.maxTokens).toBe(2000);
  });

  it('prefers the env var over the compiled default when only the env var is set', async () => {
    process.env['FINANCE_CORRECTIONS_AI_MODEL'] = 'env-model';

    await generateRules(db, oneTransaction());

    expect(captured?.model).toBe('env-model');
  });

  it('prefers the stored setting over both the env var and the compiled default', async () => {
    process.env['FINANCE_CORRECTIONS_AI_MODEL'] = 'env-model';
    setBulk(db, [
      { key: RULE_GEN_MODEL_KEY, value: 'setting-model' },
      { key: RULE_GEN_MAX_TOKENS_KEY, value: '512' },
    ]);
    invalidateAiSettingsCache();

    await generateRules(db, oneTransaction());

    expect(captured?.model).toBe('setting-model');
    expect(captured?.maxTokens).toBe(512);
  });
});
