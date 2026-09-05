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

import {
  describeForMatching,
  patternMatchesDescription,
} from '../../../../contract/pattern-match.js';
import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactionCorrections } from '../../../../db/schema/corrections.js';
import { buildRevisePrompt, reviseChangeSet, type ReviseArgs } from '../ai-revise.js';
import { __setClaudeCompleterForTests } from '../ai-runtime.js';
import { applyChangeSet } from '../service.js';

import type { ChangeSet } from '../../../../contract/rest-corrections.js';
import type { FinanceDb } from '../../../../db/services/internal.js';
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

    expect(prompt).toContain('uppercase with digits stripped');
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
