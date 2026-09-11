/**
 * `reviseChangeSet` must not ask the model to corrupt a `regex` pattern, and
 * must not hand back an `add` op that cannot fire (POPS-3000).
 *
 * The revise prompt used to end with an unconditional "Normalize patterns to
 * uppercase with digits stripped", which is right for `exact`/`contains` and
 * destructive for `regex` — `\d{4}-\d{4}` becomes `\D{}-\D{}`, still a valid
 * regular expression and structurally unable to match. `applyAddOp` then
 * stores it verbatim, exactly as the storage contract requires, so the
 * corruption the prompt asked for is faithfully persisted.
 *
 * These assert the PERSISTED row and run the real matcher against the
 * original descriptor, not the returned op and the preview: POPS-2704's tests
 * asserted the latter and would have passed against this defect.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setBulk } from '@pops/pillar-settings/service';

import {
  describeForMatching,
  patternMatchesDescription,
} from '../../../../contract/pattern-match.js';
import {
  RULE_GEN_MAX_TOKENS_KEY,
  RULE_GEN_MODEL_KEY,
} from '../../../../contract/settings/ai-settings-keys.js';
import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactionCorrections } from '../../../../db/schema/corrections.js';
import { invalidateAiSettingsCache } from '../../ai-settings-resolver.js';
import { buildRevisePrompt, reviseChangeSet, type ReviseArgs } from '../ai-revise.js';
import { __setClaudeCompleterForTests, CORRECTIONS_DEFAULT_MODEL } from '../ai-runtime.js';
import { applyChangeSet } from '../service.js';

import type { ChangeSet } from '../../../../contract/rest-corrections.js';
import type { FinanceDb } from '../../../../db/services/internal.js';
import type { ClaudeRequest } from '../ai-runtime.js';
import type { CorrectionSignal } from '../ai-types.js';

const DESCRIPTOR = 'AMAZON MKTP 1234-5678 SYDNEY';

function regexSignal(): CorrectionSignal {
  return {
    descriptionPattern: 'AMAZON MKTP \\d{4}-\\d{4}',
    matchType: 'regex',
    entityId: 'ent-amazon',
    entityName: 'Amazon',
  };
}

function changeSetWithPattern(
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex'
): ChangeSet {
  return {
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: pattern,
          matchType,
          entityId: 'ent-amazon',
          entityName: 'Amazon',
          tags: [],
        },
      },
    ],
  };
}

function reviseArgs(signal: CorrectionSignal, current: ChangeSet): ReviseArgs {
  return {
    signal,
    currentChangeSet: current,
    instruction: 'tighten the pattern',
    triggeringTransactions: [{ description: DESCRIPTOR }],
  };
}

function stubCompleterReturning(changeSet: ChangeSet): void {
  __setClaudeCompleterForTests(() =>
    Promise.resolve(JSON.stringify({ changeSet, rationale: 'revised' }))
  );
}

describe('buildRevisePrompt — pattern storage instruction', () => {
  it('does not tell the model to strip digits from a regex pattern', () => {
    const signal = regexSignal();
    const prompt = buildRevisePrompt(
      reviseArgs(signal, changeSetWithPattern(signal.descriptionPattern, 'regex')),
      'tighten the pattern'
    );

    expect(prompt).not.toContain('digits stripped');
    expect(prompt).toContain('stored verbatim');
  });

  it('still instructs normalisation for an exact signal', () => {
    const signal: CorrectionSignal = {
      descriptionPattern: 'AMAZON MKTP',
      matchType: 'exact',
      entityId: 'ent-amazon',
      entityName: 'Amazon',
    };
    const prompt = buildRevisePrompt(
      reviseArgs(signal, changeSetWithPattern('AMAZON MKTP', 'exact')),
      'tighten the pattern'
    );

    expect(prompt).toContain('digits are preserved');
  });
});

describe('reviseChangeSet — a revised add op must be able to fire', () => {
  let db: FinanceDb;

  beforeEach(() => {
    db = freshMigratedFinanceDb().db;
  });

  afterEach(() => {
    __setClaudeCompleterForTests(null);
  });

  it('refuses a regex pattern the model normalised into an inert one', async () => {
    stubCompleterReturning(changeSetWithPattern('AMAZON MKTP \\D{}-\\D{}', 'regex'));

    await expect(
      reviseChangeSet(db, reviseArgs(regexSignal(), changeSetWithPattern('AMAZON MKTP', 'regex')))
    ).rejects.toThrow(/matches none of the triggering transactions/);

    expect(db.select().from(transactionCorrections).all()).toHaveLength(0);
  });

  it('persists a metacharacter regex untouched and the real matcher fires it', async () => {
    const revised = 'AMAZON MKTP \\d{4}-\\d{4}';
    stubCompleterReturning(changeSetWithPattern(revised, 'regex'));

    const result = await reviseChangeSet(
      db,
      reviseArgs(regexSignal(), changeSetWithPattern('AMAZON MKTP', 'regex'))
    );
    applyChangeSet(db, result.changeSet);

    const [row] = db.select().from(transactionCorrections).all();
    expect(row?.descriptionPattern).toBe(revised);
    expect(
      patternMatchesDescription(
        row?.descriptionPattern ?? '',
        row?.matchType ?? 'regex',
        describeForMatching(DESCRIPTOR)
      )
    ).toBe(true);
  });

  it('accepts a revision when the caller supplied no triggering transactions to check against', async () => {
    stubCompleterReturning(changeSetWithPattern('AMAZON MKTP \\D{}-\\D{}', 'regex'));

    const result = await reviseChangeSet(db, {
      ...reviseArgs(regexSignal(), changeSetWithPattern('AMAZON MKTP', 'regex')),
      triggeringTransactions: [],
    });

    expect(result.changeSet.ops).toHaveLength(1);
  });
});

describe('reviseChangeSet — model/max-tokens resolution (POPS-2589)', () => {
  let db: FinanceDb;
  let captured: ClaudeRequest | null;

  function stubCompleterCapturing(changeSet: ChangeSet): void {
    captured = null;
    __setClaudeCompleterForTests((req) => {
      captured = req;
      return Promise.resolve(JSON.stringify({ changeSet, rationale: 'revised' }));
    });
  }

  beforeEach(() => {
    invalidateAiSettingsCache();
    db = freshMigratedFinanceDb().db;
  });

  afterEach(() => {
    __setClaudeCompleterForTests(null);
    delete process.env['FINANCE_CORRECTIONS_AI_MODEL'];
  });

  it('uses the compiled defaults when neither a setting nor an env var is present', async () => {
    const signal = regexSignal();
    stubCompleterCapturing(changeSetWithPattern(signal.descriptionPattern, 'regex'));

    await reviseChangeSet(
      db,
      reviseArgs(signal, changeSetWithPattern(signal.descriptionPattern, 'regex'))
    );

    expect(captured?.model).toBe(CORRECTIONS_DEFAULT_MODEL);
    expect(captured?.maxTokens).toBe(2000);
  });

  it('prefers the env var over the compiled default when only the env var is set', async () => {
    process.env['FINANCE_CORRECTIONS_AI_MODEL'] = 'env-model';
    const signal = regexSignal();
    stubCompleterCapturing(changeSetWithPattern(signal.descriptionPattern, 'regex'));

    await reviseChangeSet(
      db,
      reviseArgs(signal, changeSetWithPattern(signal.descriptionPattern, 'regex'))
    );

    expect(captured?.model).toBe('env-model');
  });

  it('prefers the stored setting over both the env var and the compiled default', async () => {
    process.env['FINANCE_CORRECTIONS_AI_MODEL'] = 'env-model';
    setBulk(db, [
      { key: RULE_GEN_MODEL_KEY, value: 'setting-model' },
      { key: RULE_GEN_MAX_TOKENS_KEY, value: '512' },
    ]);
    invalidateAiSettingsCache();
    const signal = regexSignal();
    stubCompleterCapturing(changeSetWithPattern(signal.descriptionPattern, 'regex'));

    await reviseChangeSet(
      db,
      reviseArgs(signal, changeSetWithPattern(signal.descriptionPattern, 'regex'))
    );

    expect(captured?.model).toBe('setting-model');
    expect(captured?.maxTokens).toBe(512);
  });
});
