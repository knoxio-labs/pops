/**
 * POPS-2593 — no proposal surface may narrow a rule to an account.
 *
 * An account-scoped rule is strictly narrower than a global one, so it is
 * worse by default: it stops applying the moment the same merchant shows up on
 * another card. Only an operator who has decided a merchant is genuinely
 * account-specific should opt in. Every automated proposer therefore emits
 * `accountId: null`, and this suite pins that for each surface so a later
 * change to a prompt or a builder cannot quietly start proposing scopes.
 */
import { describe, expect, it } from 'vitest';

import { applyChangeSetToRules } from '../../../../contract/corrections-pure.js';
import {
  CorrectionSignalSchema,
  ProposedRuleSchema,
} from '../../../../contract/rest-corrections-ai-schemas.js';
import { transactionTagRules } from '../../../../db/schema.js';
import { buildAddChangeSet, buildEditChangeSet } from '../changeset-builders.js';

import type { CorrectionRow } from '../types.js';

const buildArgs = {
  effectiveSignal: {
    descriptionPattern: 'LATE FEE',
    matchType: 'exact' as const,
    entityId: 'ent-bank',
    entityName: 'Bank',
    tags: ['fee'],
  },
  normalizedPattern: 'LATE FEE',
  matchType: 'exact' as const,
  hasFeedback: false,
};

function scopedRule(): CorrectionRow {
  return {
    id: 'rule-1',
    descriptionPattern: 'LATE FEE',
    accountId: 'acct-bank-a',
    matchType: 'exact',
    entityId: 'ent-old',
    entityName: 'Old',
    location: null,
    tags: '[]',
    transactionType: null,
    isActive: true,
    confidence: 0.8,
    priority: 0,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
  };
}

describe('/corrections/propose-changeset', () => {
  it('proposes a global rule, never one scoped to an account', () => {
    const changeSet = buildAddChangeSet(buildArgs);
    const [op] = changeSet.ops;

    expect(op?.op).toBe('add');
    expect(op?.op === 'add' ? op.data.accountId : 'not-an-add').toBeNull();
  });

  it('materialises that proposal as a rule matching every account', () => {
    const [added] = applyChangeSetToRules([], buildAddChangeSet(buildArgs));

    expect(added?.accountId).toBeNull();
  });

  it('leaves an existing rule’s scope untouched when it proposes an edit', () => {
    // The operator narrowed this rule deliberately; a proposal that refreshes
    // its entity must not silently widen it back out.
    const changeSet = buildEditChangeSet(scopedRule(), buildArgs);
    const [op] = changeSet.ops;

    expect(op?.op).toBe('edit');
    expect(op?.op === 'edit' ? 'accountId' in op.data : true).toBe(false);

    const [edited] = applyChangeSetToRules([scopedRule()], changeSet);
    expect(edited?.accountId).toBe('acct-bank-a');
    expect(edited?.entityId).toBe('ent-bank');
  });

  it('cannot carry an account through the correction signal at all', () => {
    // The signal is the proposer's only input. With no field for it, an
    // account cannot reach the builder even if a caller sends one.
    const parsed = CorrectionSignalSchema.parse({
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      accountId: 'acct-bank-a',
    });

    expect(parsed).not.toHaveProperty('accountId');
  });
});

describe('/corrections/generate-rules', () => {
  it('has no account field on a proposed rule, so it cannot propose one', () => {
    const parsed = ProposedRuleSchema.parse({
      descriptionPattern: 'LATE FEE',
      matchType: 'exact',
      tags: ['fee'],
      reasoning: 'because',
      accountId: 'acct-bank-a',
    });

    expect(parsed).not.toHaveProperty('accountId');
  });
});

describe('/tag-rules/propose', () => {
  it('writes to a table that has no account column, so nothing to scope', () => {
    // The third proposal surface targets `transaction_tag_rules`, a different
    // table. POPS-2593 adds no account column there — tag rules scope on
    // `entityId` instead — so this surface is global by construction. Pinned
    // so adding one there becomes a deliberate decision, not a drive-by.
    expect(Object.keys(transactionTagRules)).not.toContain('accountId');
  });
});
