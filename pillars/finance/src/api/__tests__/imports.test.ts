/**
 * Integration tests for the `imports.*` REST surface against the real Express
 * app, with the contacts pillar provided by an injected fake: the matcher
 * fetches the contact set live and matches in memory; commit pre-creates pending
 * contacts (create-or-fetch-by-name) BEFORE the finance tx; createEntity goes to
 * contacts. Covers the session-poll pattern, dedup, the re-evaluation endpoints
 * (404/412 mapping), atomic commit (temp-id resolution, changeset application,
 * rollback, retroactive reclassification), 409 idempotency on a pre-existing
 * contact name, and contacts-down degradation.
 *
 * Pre-existing rows (dedup / reclassification fixtures) are seeded directly via
 * `importsService.insertImportTransaction` — the REST surface has no write path
 * of its own outside `commitImport`.
 *
 * The AI categorizer is disabled by pinning `FINANCE_AI_CATEGORIZER_ENABLED`
 * off in `beforeEach`, so unmatched rows land in `uncertain` with
 * `'No entity match found (AI categorization disabled)'`, the run result
 * carries an `AI_CATEGORIZATION_UNAVAILABLE` warning, and the AI usage
 * counters stay zero.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type CallResult } from '@pops/pillar-sdk/client';

import {
  importsService,
  openFinanceDb,
  transactionTagRulesService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { page, stubHandle } from '../contacts/__tests__/stub-handle.js';
import {
  createContactsClient,
  type ContactEntity,
  type ContactsClient,
} from '../contacts/client.js';
import { clearProgress } from '../modules/imports/index.js';
import { makeContactsFake, type ContactsFake, type SeedContact } from './contacts-fake.js';
import { makeClient, waitForImportCompletion } from './test-utils.js';

import type { ProcessImportOutput } from '../modules/imports/types.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  // The suite asserts the disabled-categorizer contract against the real app,
  // so the flag must be pinned off — an ambient FINANCE_AI_CATEGORIZER_ENABLED
  // from the shell would route unmatched rows down the live AI path.
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-imports-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  clearProgress();
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(contacts: ContactsClient = makeContactsFake()) {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts,
    })
  );
}

function processResultOf(progress: { result?: unknown } | null): ProcessImportOutput {
  if (!progress?.result) throw new Error('Expected a completed process-import session result');
  return progress.result as ProcessImportOutput;
}

function parsed(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-02-13',
    description: 'TEST MERCHANT',
    amount: -100,
    account: 'Amex',
    rawRow: '{}',
    checksum: `chk-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

function confirmed(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-02-13',
    description: 'CONFIRMED MERCHANT',
    amount: -42.5,
    account: 'Amex',
    rawRow: '{"line":"x"}',
    checksum: `chk-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

/** Seed a pre-existing transaction directly (the REST surface has no write path outside `commitImport`). */
function seedTransaction(overrides: {
  description: string;
  checksum: string;
  entityId?: string | null;
  entityName?: string | null;
}) {
  importsService.insertImportTransaction(financeDb.db, {
    description: overrides.description,
    account: 'Amex',
    amountCents: -4250,
    date: '2026-02-13',
    type: 'purchase',
    tags: [],
    entityId: overrides.entityId ?? null,
    entityName: overrides.entityName ?? null,
    location: null,
    rawRow: '{"line":"x"}',
    checksum: overrides.checksum,
  });
}

function withContacts(seed: SeedContact[]): ContactsFake {
  return makeContactsFake({ seed });
}

describe('imports.processImport — session poll + live-fetch matching', () => {
  it('matches a contact from the live fetch and returns it via the polled result', async () => {
    const contacts = withContacts([{ id: 'woolworths-id', name: 'Woolworths' }]);
    const c = client(contacts);

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLWORTHS 1234', checksum: 'match-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.entity.entityName).toBe('Woolworths');
    expect(result.matched[0]?.entity.entityId).toBe('woolworths-id');
    expect(result.matched[0]?.entity.matchType).toBe('prefix');
  });

  it('matches via a contact alias from the live fetch', async () => {
    const contacts = withContacts([{ id: 'ww-id', name: 'Woolworths', aliases: ['WOOLIES'] }]);
    const c = client(contacts);

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLIES METRO', checksum: 'alias-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched[0]?.entity.entityName).toBe('Woolworths');
    expect(result.matched[0]?.entity.matchType).toBe('alias');
  });

  it('degrades to a no-match run when contacts is unavailable — never throws', async () => {
    const c = client(makeContactsFake({ unavailable: true }));

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLWORTHS 1234', checksum: 'down-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
  });

  it('with AI disabled, an unmatched row is uncertain with the disabled reason and the run carries one AI_CATEGORIZATION_UNAVAILABLE warning', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ZZZ UNKNOWN VENDOR 9', checksum: 'nomatch-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    expect(result.aiUsage).toBeUndefined();
    expect(result.warnings).toEqual([
      {
        type: 'AI_CATEGORIZATION_UNAVAILABLE',
        message:
          'AI categorization is disabled on this server — unmatched transactions were not sent to AI',
        affectedCount: 1,
        details: 'FINANCE_AI_CATEGORIZER_ENABLED != true',
      },
    ]);
  });

  it('skips checksums that already exist in the transactions table (dedup)', async () => {
    const c = client();
    seedTransaction({ description: 'PRIOR ROW', checksum: 'dup-checksum' });

    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'DUPLICATE', checksum: 'dup-checksum' }),
        parsed({ description: 'FRESH ROW', checksum: 'fresh-checksum' }),
      ],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.checksum).toBe('dup-checksum');
    const total =
      result.matched.length +
      result.uncertain.length +
      result.failed.length +
      result.skipped.length;
    expect(total).toBe(2);
  });

  it('leaves a transfer-keyword row with no rule or entity match uncertain (keyword heuristic removed, #3607)', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'PayID Payment Received', amount: -2300, checksum: 'xfer-1' }),
      ],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
  });

  it('returns an empty bucketed result for an empty batch', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({ transactions: [], account: 'Amex' });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toEqual([]);
    expect(result.uncertain).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('rejects a malformed payload (bad date format) with 400', async () => {
    const c = client();
    await expect(
      c.imports.processImport({
        transactions: [parsed({ date: '13/02/2026' })],
        account: 'Amex',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('imports.processImport — entity-less correction rules (#3598)', () => {
  it('routes an entity-less purchase rule to uncertain so a merchant is still required', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(created.data.id, { confidence: 0.9 });

    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'bunnings-1' }),
      ],
      account: 'Amex',
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    const row = result.uncertain[0];
    expect(row?.ruleProvenance?.source).toBe('correction');
    expect(row?.transactionType).toBe('purchase');
    expect(row?.entity.matchType).toBe('learned');
    expect(row?.entity.entityId).toBeUndefined();
  });

  it('keeps a high-confidence entity-less transfer rule matched (transfers carry no merchant)', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'LOAN OFFSET SWEEP',
      matchType: 'contains',
      transactionType: 'transfer',
    });
    await c.corrections.update(created.data.id, { confidence: 0.95 });

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'LOAN OFFSET SWEEP 8842', checksum: 'sweep-1' })],
      account: 'Amex',
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    expect(result.uncertain).toHaveLength(0);
    expect(result.matched).toHaveLength(1);
    const row = result.matched[0];
    expect(row?.ruleProvenance?.source).toBe('correction');
    expect(row?.transactionType).toBe('transfer');
    expect(row?.entity.matchType).toBe('learned');
  });

  it('routes a low-confidence entity-less transfer rule to uncertain (below the matched threshold)', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'ROUND UP TO SAVER',
      matchType: 'contains',
      transactionType: 'transfer',
    });
    // Applies (≥ 0.7 minConfidence) but sits below the 0.9 matched threshold.
    await c.corrections.update(created.data.id, { confidence: 0.8 });

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ROUND UP TO SAVER 22', checksum: 'roundup-1' })],
      account: 'Amex',
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    const row = result.uncertain[0];
    expect(row?.ruleProvenance?.source).toBe('correction');
    expect(row?.transactionType).toBe('transfer');
    expect(row?.entity.matchType).toBe('learned');
  });
});

describe('imports.processImport — correction rule usage telemetry (#3626)', () => {
  it('bumps timesApplied + lastUsedAt on the winning rule when a live import matches it', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(created.data.id, { confidence: 0.9 });
    expect(created.data.timesApplied).toBe(0);

    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'bunnings-usage-1' }),
      ],
      account: 'Amex',
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    const after = await c.corrections.get(created.data.id);
    expect(after.data.timesApplied).toBe(1);
    expect(after.data.lastUsedAt).not.toBeNull();
  });

  it('does not bump usage from a pending-rules preview (reevaluateWithPendingRules)', async () => {
    const c = client();

    // No rule exists yet at process time — the transaction lands uncertain.
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'preview-usage-1' }),
      ],
      account: 'Amex',
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    // The rule is created (persisted) AFTER processing, so a live re-evaluation
    // of the still-uncertain transaction would now match it in-memory.
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(created.data.id, { confidence: 0.9 });

    // `reevaluateWithPendingRules` always merges DB rules with (possibly empty)
    // pending ChangeSets in-memory — a preview, never a real application.
    await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [],
    });

    const after = await c.corrections.get(created.data.id);
    expect(after.data.timesApplied).toBe(0);
    expect(after.data.lastUsedAt).toBeNull();
  });
});

describe('tag-rule usage telemetry — read-only lookups never count as usage', () => {
  it('does not bump a tag rule from the read-only GET /transactions/suggest-tags endpoint', async () => {
    const c = client();
    const rule = transactionTagRulesService.createTransactionTagRule(financeDb.db, {
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      tags: ['Hardware'],
    });
    expect(rule.timesApplied).toBe(0);

    const result = await c.transactions.suggestTags({
      description: 'BUNNINGS WAREHOUSE KINGSGROVE',
    });
    expect(result.tags).toEqual([{ tag: 'Hardware', source: 'rule', pattern: 'BUNNINGS' }]);

    const after = transactionTagRulesService.getTransactionTagRule(financeDb.db, rule.id);
    expect(after.timesApplied).toBe(0);
    expect(after.lastUsedAt).toBeNull();
  });

  it('does not bump a tag rule from a pending-rules preview (reevaluateWithPendingRules)', async () => {
    const c = client();

    // No rule exists yet at process time — the transaction lands uncertain.
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'tag-preview-usage-1' }),
      ],
      account: 'Amex',
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    // Both rules are created (persisted) AFTER processing, so a live
    // re-evaluation of the still-uncertain transaction would now match them
    // in-memory.
    const correction = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(correction.data.id, { confidence: 0.9 });
    const tagRule = transactionTagRulesService.createTransactionTagRule(financeDb.db, {
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      tags: ['Hardware'],
    });

    // `reevaluateWithPendingRules` always merges DB rules with (possibly empty)
    // pending ChangeSets in-memory — a preview, never a real application.
    await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [],
    });

    const after = transactionTagRulesService.getTransactionTagRule(financeDb.db, tagRule.id);
    expect(after.timesApplied).toBe(0);
    expect(after.lastUsedAt).toBeNull();
  });
});

describe('imports.getImportProgress', () => {
  it('returns null for an unknown session', async () => {
    const c = client();
    const progress = await c.imports.getImportProgress('00000000-0000-0000-0000-000000000000');
    expect(progress).toBeNull();
  });
});

describe('imports.createEntity — create-or-fetch against contacts', () => {
  it('creates a contact and returns its id + name', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const res = await c.imports.createEntity({ name: 'New Merchant' });
    expect(res.entityName).toBe('New Merchant');
    expect(contacts.created).toEqual([{ name: 'New Merchant', type: 'company' }]);
    expect(contacts.entities.find((e) => e.name === 'New Merchant')?.id).toBe(res.entityId);
  });

  it('fetches the existing contact by name on a 409 (idempotent re-create)', async () => {
    const contacts = withContacts([{ id: 'existing-id', name: 'Acme' }]);
    const c = client(contacts);
    const res = await c.imports.createEntity({ name: 'Acme' });
    expect(res.entityId).toBe('existing-id');
    expect(contacts.entities.filter((e) => e.name === 'Acme')).toHaveLength(1);
  });

  it('rejects an empty name with 400', async () => {
    const c = client();
    await expect(c.imports.createEntity({ name: '' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('imports.applyChangeSetAndReevaluate', () => {
  async function uncertainSession(c: ReturnType<typeof client>, checksum: string) {
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ACME SUPPLIES 1234', checksum })],
      account: 'Amex',
    });
    const before = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(before.uncertain).toHaveLength(1);
    return sessionId;
  }

  it('applies a ChangeSet and re-buckets the matching transaction, mutating the session', async () => {
    const c = client(withContacts([{ id: 'woolworths-id', name: 'Woolworths' }]));
    const sessionId = await uncertainSession(c, 'acme-apply-1');

    const res = await c.imports.applyChangeSetAndReevaluate({
      sessionId,
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'ACME SUPPLIES',
              matchType: 'contains',
              entityId: 'woolworths-id',
              entityName: 'Woolworths',
              tags: [],
              confidence: 0.95,
            },
          },
        ],
      },
      minConfidence: 0.7,
    });

    expect(res.affectedCount).toBeGreaterThan(0);
    expect(res.result.matched.some((t) => t.checksum === 'acme-apply-1')).toBe(true);
    expect(res.result.uncertain.some((t) => t.checksum === 'acme-apply-1')).toBe(false);

    const after = await c.imports.getImportProgress(sessionId);
    expect(processResultOf(after).matched.some((t) => t.checksum === 'acme-apply-1')).toBe(true);
  });

  it('404s an unknown session', async () => {
    const c = client();
    await expect(
      c.imports.applyChangeSetAndReevaluate({
        sessionId: '00000000-0000-0000-0000-000000000000',
        changeSet: {
          ops: [
            {
              op: 'add',
              data: { descriptionPattern: 'X', matchType: 'exact', tags: [], confidence: 0.9 },
            },
          ],
        },
        minConfidence: 0.7,
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('does NOT mutate the session when the ChangeSet apply fails (unknown rule id → 404)', async () => {
    const c = client();
    const sessionId = await uncertainSession(c, 'acme-apply-fail');

    await expect(
      c.imports.applyChangeSetAndReevaluate({
        sessionId,
        changeSet: { ops: [{ op: 'edit', id: 'does-not-exist', data: { confidence: 0.9 } }] },
        minConfidence: 0.7,
      })
    ).rejects.toMatchObject({ status: 404 });

    const after = await c.imports.getImportProgress(sessionId);
    expect(after?.status).toBe('completed');
    expect(processResultOf(after).uncertain.some((t) => t.checksum === 'acme-apply-fail')).toBe(
      true
    );
  });
});

describe('imports.reevaluateWithPendingRules', () => {
  async function uncertainSession(c: ReturnType<typeof client>, checksum: string) {
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ACME SUPPLIES 1234', checksum })],
      account: 'Amex',
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    return sessionId;
  }

  it('re-evaluates using merged (DB + pending) rules without writing the rule to the DB', async () => {
    const c = client(withContacts([{ id: 'woolworths-id', name: 'Woolworths' }]));
    const sessionId = await uncertainSession(c, 'reeval-merged');

    const res = await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [
        {
          changeSet: {
            ops: [
              {
                op: 'add',
                data: {
                  descriptionPattern: 'ACME SUPPLIES',
                  matchType: 'contains',
                  entityId: 'woolworths-id',
                  entityName: 'Woolworths',
                  tags: [],
                  confidence: 0.95,
                },
              },
            ],
          },
        },
      ],
    });

    expect(res.affectedCount).toBeGreaterThan(0);
    expect(res.result.matched.some((t) => t.checksum === 'reeval-merged')).toBe(true);

    const probe = await c.imports.processImport({
      transactions: [parsed({ description: 'ACME SUPPLIES 9999', checksum: 'reeval-probe' })],
      account: 'Amex',
    });
    const probeResult = await waitForImportCompletion<ProcessImportOutput>(c, probe.sessionId);
    expect(probeResult.uncertain.some((t) => t.checksum === 'reeval-probe')).toBe(true);
  });

  it('accepts an empty pendingChangeSets array (re-evaluates against DB rules only)', async () => {
    const c = client();
    const sessionId = await uncertainSession(c, 'reeval-empty');
    const res = await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [],
    });
    expect(res.result).toBeDefined();
    expect(res.affectedCount).toBe(0);
  });

  it('404s an unknown session', async () => {
    const c = client();
    await expect(
      c.imports.reevaluateWithPendingRules({
        sessionId: '00000000-0000-0000-0000-000000000000',
        minConfidence: 0.7,
        pendingChangeSets: [],
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('imports.commitImport — pre-create contacts then write the finance tx', () => {
  it('commits transactions only', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      transactions: [confirmed({ description: 'COLES SUPERMARKET', checksum: 'commit-1' })],
    });
    expect(res.data.entitiesCreated).toBe(0);
    expect(res.data.transactionsImported).toBe(1);
    expect(res.data.transactionsFailed).toBe(0);
    expect(res.data.rulesApplied).toEqual({ add: 0, edit: 0, disable: 0, remove: 0 });
    expect(res.data.tagRulesApplied).toBe(0);
    expect(res.message).toBe('Import committed');

    const list = await c.transactions.list({ search: 'COLES SUPERMARKET' });
    expect(list.data).toHaveLength(1);
  });

  it('persists match provenance from the confirmed transaction (CF057/#3658)', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'SPOTIFY AB',
          checksum: 'commit-provenance-learned',
          entityId: 'ent-spotify',
          entityName: 'Spotify',
          matchType: 'learned',
          matchRuleId: 'rule-42',
          matchConfidence: 0.91,
        }),
      ],
    });

    const row = financeDb.raw
      .prepare(
        'SELECT match_type, match_rule_id, match_confidence FROM transactions WHERE checksum = ?'
      )
      .get('commit-provenance-learned') as {
      match_type: string | null;
      match_rule_id: string | null;
      match_confidence: number | null;
    };
    expect(row).toEqual({
      match_type: 'learned',
      match_rule_id: 'rule-42',
      match_confidence: 0.91,
    });
  });

  it('persists no provenance when the confirmed transaction carries none (backward compatible)', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({ description: 'COLES SUPERMARKET', checksum: 'commit-no-provenance' }),
      ],
    });

    const row = financeDb.raw
      .prepare(
        'SELECT match_type, match_rule_id, match_confidence FROM transactions WHERE checksum = ?'
      )
      .get('commit-no-provenance') as {
      match_type: string | null;
      match_rule_id: string | null;
      match_confidence: number | null;
    };
    expect(row).toEqual({ match_type: null, match_rule_id: null, match_confidence: null });
  });

  it('pre-creates pending contacts and resolves temp ids to the contact id', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000001';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'Woolworths', type: 'company' }],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS 1234',
          checksum: 'commit-temp',
          entityId: tempId,
          entityName: 'Woolworths',
        }),
      ],
    });
    expect(res.data.entitiesCreated).toBe(1);

    const contact = contacts.entities.find((e) => e.name === 'Woolworths');
    expect(contact).toBeDefined();
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE description = ?')
      .get('WOOLWORTHS 1234') as { entity_id: string };
    expect(txn.entity_id).toBe(contact?.id);
    expect(txn.entity_id).not.toBe(tempId);
  });

  it('carries the non-default type to the contacts create (preserving the type override)', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000002';
    await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      transactions: [confirmed({ checksum: 'commit-gov' })],
    });
    expect(contacts.created).toContainEqual({ name: 'ATO', type: 'government' });
    expect(contacts.entities.find((e) => e.name === 'ATO')?.type).toBe('government');
  });

  it('is idempotent on a 409: a pre-existing contact name reuses the existing id', async () => {
    const contacts = withContacts([{ id: 'preexisting-ato', name: 'ATO', type: 'government' }]);
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000000a';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      transactions: [confirmed({ checksum: 'commit-dup', entityId: tempId, entityName: 'ATO' })],
    });
    // No duplicate contact created; the transaction points at the existing id.
    expect(contacts.entities.filter((e) => e.name === 'ATO')).toHaveLength(1);
    // Reusing an existing contact must NOT inflate the created count.
    expect(res.data.entitiesCreated).toBe(0);
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE checksum = ?')
      .get('commit-dup') as { entity_id: string };
    expect(txn.entity_id).toBe('preexisting-ato');
  });

  it('counts only real creates when a commit mixes a new and a reused contact', async () => {
    const contacts = withContacts([{ id: 'preexisting-ato', name: 'ATO', type: 'government' }]);
    const c = client(contacts);
    const tempNew = 'temp:entity:00000000-0000-0000-0000-00000000000b';
    const tempReused = 'temp:entity:00000000-0000-0000-0000-00000000000c';
    const res = await c.imports.commitImport({
      entities: [
        { tempId: tempNew, name: 'BrandNewCo', type: 'company' },
        { tempId: tempReused, name: 'ATO', type: 'government' },
      ],
      transactions: [
        confirmed({ checksum: 'mixed-new', entityId: tempNew, entityName: 'BrandNewCo' }),
        confirmed({ checksum: 'mixed-reused', entityId: tempReused, entityName: 'ATO' }),
      ],
    });
    expect(res.data.entitiesCreated).toBe(1);
    expect(contacts.entities.filter((e) => e.name === 'ATO')).toHaveLength(1);
    expect(contacts.entities.filter((e) => e.name === 'BrandNewCo')).toHaveLength(1);
  });

  it('resolves temp ids inside correction ChangeSet add ops', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000003';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'TestCorp' }],
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'TESTCORP',
                matchType: 'exact',
                entityId: tempId,
                entityName: 'TestCorp',
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ checksum: 'commit-cs' })],
    });
    expect(res.data.rulesApplied).toEqual({ add: 1, edit: 0, disable: 0, remove: 0 });

    const contact = contacts.entities.find((e) => e.name === 'TestCorp');
    const rule = financeDb.raw
      .prepare('SELECT entity_id FROM transaction_corrections WHERE description_pattern = ?')
      .get('TESTCORP') as { entity_id: string };
    expect(rule.entity_id).toBe(contact?.id);
  });

  it('degrades a bundled tags-only add op instead of rolling back the whole commit (CF061/#3650)', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000000d';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'DegradeCorp' }],
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'GOOD RULE',
                matchType: 'contains',
                transactionType: 'purchase',
              },
            },
            {
              op: 'add',
              data: { descriptionPattern: 'BAD RULE', matchType: 'contains', tags: ['X'] },
            },
          ],
        },
      ],
      transactions: [
        confirmed({
          checksum: 'commit-degrade',
          entityId: tempId,
          entityName: 'DegradeCorp',
        }),
      ],
    });

    // The good rule, the entity creation, and the transaction insert all land —
    // only the tags-only op is dropped.
    expect(res.data.transactionsImported).toBe(1);
    expect(res.data.transactionsFailed).toBe(0);
    expect(res.data.entitiesCreated).toBe(1);
    expect(res.data.rulesApplied).toEqual({ add: 1, edit: 0, disable: 0, remove: 0 });

    const rules = financeDb.raw
      .prepare('SELECT description_pattern FROM transaction_corrections')
      .all() as { description_pattern: string }[];
    expect(rules.map((r) => r.description_pattern)).toEqual(['GOOD RULE']);

    const contact = contacts.entities.find((e) => e.name === 'DegradeCorp');
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE checksum = ?')
      .get('commit-degrade') as { entity_id: string };
    expect(txn.entity_id).toBe(contact?.id);
  });

  it('applies pending tag-rule ChangeSets during commit', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          source: 'unit-test',
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'TAG_RULE_TEST',
                matchType: 'contains',
                tags: ['UnitTestTag'],
              },
            },
          ],
        },
      ],
      transactions: [
        confirmed({
          description: 'TAG_RULE_TEST 1',
          checksum: 'commit-tagrule',
          tags: ['UnitTestTag'],
        }),
      ],
    });
    expect(res.data.tagRulesApplied).toBe(1);

    const rule = financeDb.raw
      .prepare(
        'SELECT description_pattern FROM transaction_tag_rules WHERE description_pattern = ?'
      )
      .get('TAG_RULE_TEST') as { description_pattern: string } | undefined;
    expect(rule?.description_pattern).toBe('TAG_RULE_TEST');
  });

  it('rejects an unknown temp id with 400', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        transactions: [
          confirmed({
            checksum: 'commit-bad-temp',
            entityId: 'temp:entity:00000000-0000-0000-0000-999999999999',
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a transaction entity id with a stray temp: prefix and persists no placeholder (CF016)', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        transactions: [
          confirmed({
            checksum: 'commit-stray-temp',
            entityId: 'temp:contact:00000000-0000-0000-0000-000000000abc',
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });

    const placeholderRows = financeDb.raw
      .prepare("SELECT count(*) as c FROM transactions WHERE entity_id LIKE 'temp:%'")
      .get() as { c: number };
    expect(placeholderRows.c).toBe(0);
  });

  it('rejects a correction ChangeSet op carrying a stray temp: entity id and writes no rule (CF016)', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        changeSets: [
          {
            ops: [
              {
                op: 'add',
                data: {
                  descriptionPattern: 'STRAYTEMP',
                  matchType: 'exact',
                  entityId: 'temp:contact:00000000-0000-0000-0000-000000000def',
                  entityName: 'Stray',
                },
              },
            ],
          },
        ],
        transactions: [confirmed({ checksum: 'commit-stray-cs' })],
      })
    ).rejects.toMatchObject({ status: 400 });

    const ruleRows = financeDb.raw
      .prepare("SELECT count(*) as c FROM transaction_corrections WHERE entity_id LIKE 'temp:%'")
      .get() as { c: number };
    expect(ruleRows.c).toBe(0);
  });

  it('rejects duplicate temp ids with 400', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000004';
    await expect(
      c.imports.commitImport({
        entities: [
          { tempId, name: 'Entity A' },
          { tempId, name: 'Entity B' },
        ],
        transactions: [confirmed({ checksum: 'dup-temp' })],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a malformed temp id format with 400', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        entities: [{ tempId: 'bad-format', name: 'Test' }],
        transactions: [confirmed({ checksum: 'bad-format-temp' })],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rolls back ALL finance writes if a ChangeSet op references an unknown rule id', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000007';
    const txnsBefore = financeDb.raw.prepare('SELECT count(*) as c FROM transactions').get() as {
      c: number;
    };

    await expect(
      c.imports.commitImport({
        entities: [{ tempId, name: 'RollbackTest' }],
        changeSets: [
          { ops: [{ op: 'edit', id: 'non-existent-rule-id', data: { confidence: 0.9 } }] },
        ],
        transactions: [
          confirmed({ checksum: 'rollback-1', entityId: tempId, entityName: 'RollbackTest' }),
        ],
      })
    ).rejects.toMatchObject({ status: 404 });

    const txnsAfter = financeDb.raw.prepare('SELECT count(*) as c FROM transactions').get() as {
      c: number;
    };
    // The finance tx rolled back; the pre-created contact (created before the
    // tx) is a harmless orphan, surfaced by the entity-usage orphanedOnly filter.
    expect(txnsAfter.c).toBe(txnsBefore.c);
  });

  it('handles multiple entities and transactions in one commit', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId1 = 'temp:entity:00000000-0000-0000-0000-000000000008';
    const tempId2 = 'temp:entity:00000000-0000-0000-0000-000000000009';
    const res = await c.imports.commitImport({
      entities: [
        { tempId: tempId1, name: 'Woolworths' },
        { tempId: tempId2, name: 'Coles', type: 'company' },
      ],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS 1',
          checksum: 'multi-1',
          entityId: tempId1,
          entityName: 'Woolworths',
        }),
        confirmed({
          description: 'COLES 1',
          checksum: 'multi-2',
          entityId: tempId2,
          entityName: 'Coles',
        }),
        confirmed({ description: 'TRANSFER', checksum: 'multi-3', transactionType: 'transfer' }),
      ],
    });
    expect(res.data.entitiesCreated).toBe(2);
    expect(res.data.transactionsImported).toBe(3);
    expect(contacts.entities.map((e) => e.name).toSorted()).toEqual(['Coles', 'Woolworths']);
  });
});

describe('imports.commitImport — commit idempotency (#3640/#3642)', () => {
  it('a resubmit under the same commitKey is a no-op: identical result, no duplicate writes', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-0000000000c1';
    const payload = {
      commitKey: '11111111-1111-4111-8111-111111111111',
      entities: [{ tempId, name: 'IdempotentCo', type: 'company' as const }],
      changeSets: [
        {
          ops: [
            {
              op: 'add' as const,
              data: { descriptionPattern: 'IDEMPOTENTCO', matchType: 'exact' as const },
            },
          ],
        },
      ],
      transactions: [
        confirmed({
          description: 'IDEMPOTENTCO 1',
          checksum: 'idempotent-1',
          entityId: tempId,
          entityName: 'IdempotentCo',
        }),
      ],
    };

    const first = await c.imports.commitImport(payload);
    const second = await c.imports.commitImport(payload);

    expect(second.data).toEqual(first.data);
    expect(contacts.created).toHaveLength(1);

    const txnCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('idempotent-1') as { c: number };
    expect(txnCount.c).toBe(1);

    const ruleCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transaction_corrections WHERE description_pattern = ?')
      .get('IDEMPOTENTCO') as { c: number };
    expect(ruleCount.c).toBe(1);
  });

  it('two concurrent commits sharing a commitKey resolve to one applied write and one echoed result', async () => {
    const c = client();
    const payload = {
      commitKey: '22222222-2222-4222-8222-222222222222',
      transactions: [confirmed({ description: 'RACE MERCHANT', checksum: 'race-1' })],
    };

    const [a, b] = await Promise.all([
      c.imports.commitImport(payload),
      c.imports.commitImport(payload),
    ]);

    expect(a.data).toEqual(b.data);
    const txnCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('race-1') as { c: number };
    expect(txnCount.c).toBe(1);
  });

  it('omitting commitKey preserves the old best-effort behaviour (no dedup, documents the opt-in nature)', async () => {
    const c = client();
    const payload = {
      transactions: [confirmed({ description: 'NO KEY MERCHANT', checksum: 'no-key-1' })],
    };

    await c.imports.commitImport(payload);
    await c.imports.commitImport(payload);

    const txnCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('no-key-1') as { c: number };
    expect(txnCount.c).toBe(2);
  });
});

describe('imports.commitImport — contacts pre-create outbox during an outage (#3683)', () => {
  it('commits with a pending placeholder instead of aborting, and queues one outbox row', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab01';

    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'Woolworths', type: 'company' }],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS OUTAGE',
          checksum: 'outbox-commit-1',
          entityId: tempId,
          entityName: 'Woolworths',
        }),
      ],
    });

    // The commit succeeds — no 5xx, no throw — even though contacts never
    // resolved the pending entity.
    expect(res.data.transactionsImported).toBe(1);
    expect(res.data.transactionsFailed).toBe(0);
    expect(res.data.entitiesCreated).toBe(0);

    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE description = ?')
      .get('WOOLWORTHS OUTAGE') as { entity_id: string };
    expect(txn.entity_id).toMatch(/^pending:contact:/);

    const outboxRow = financeDb.raw
      .prepare(
        'SELECT id, name, type, status, attempts FROM entity_precreate_outbox WHERE name = ?'
      )
      .get('Woolworths') as {
      id: string;
      name: string;
      type: string;
      status: string;
      attempts: number;
    };
    expect(outboxRow.id).toBe(txn.entity_id);
    expect(outboxRow.type).toBe('company');
    expect(outboxRow.status).toBe('pending');
    expect(outboxRow.attempts).toBe(0);
  });

  it('threads the placeholder through a correction ChangeSet add op too', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab02';

    await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'AUSTRALIAN TAX OFFICE',
                matchType: 'exact',
                entityId: tempId,
                entityName: 'ATO',
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ checksum: 'outbox-commit-2' })],
    });

    const rule = financeDb.raw
      .prepare('SELECT entity_id FROM transaction_corrections WHERE description_pattern = ?')
      .get('AUSTRALIAN TAX OFFICE') as { entity_id: string };
    expect(rule.entity_id).toMatch(/^pending:contact:/);

    const outboxRow = financeDb.raw
      .prepare('SELECT id FROM entity_precreate_outbox WHERE name = ?')
      .get('ATO') as { id: string };
    expect(outboxRow.id).toBe(rule.entity_id);
  });

  it('queues an independent outbox row per pending entity in the same commit', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId1 = 'temp:entity:00000000-0000-0000-0000-00000000ab03';
    const tempId2 = 'temp:entity:00000000-0000-0000-0000-00000000ab04';

    await c.imports.commitImport({
      entities: [
        { tempId: tempId1, name: 'Woolworths', type: 'company' },
        { tempId: tempId2, name: 'Coles', type: 'company' },
      ],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS A',
          checksum: 'outbox-commit-3a',
          entityId: tempId1,
          entityName: 'Woolworths',
        }),
        confirmed({
          description: 'COLES A',
          checksum: 'outbox-commit-3b',
          entityId: tempId2,
          entityName: 'Coles',
        }),
      ],
    });

    const rows = financeDb.raw
      .prepare('SELECT name, status FROM entity_precreate_outbox ORDER BY name')
      .all() as { name: string; status: string }[];
    expect(rows).toEqual([
      { name: 'Coles', status: 'pending' },
      { name: 'Woolworths', status: 'pending' },
    ]);
  });

  it('a rollback later in the same commit rolls back the outbox row too', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab05';

    await expect(
      c.imports.commitImport({
        entities: [{ tempId, name: 'RollbackOutboxTest', type: 'company' }],
        changeSets: [
          { ops: [{ op: 'edit', id: 'non-existent-rule-id', data: { confidence: 0.9 } }] },
        ],
        transactions: [
          confirmed({
            checksum: 'outbox-rollback-1',
            entityId: tempId,
            entityName: 'RollbackOutboxTest',
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 404 });

    const outboxRows = financeDb.raw
      .prepare('SELECT count(*) as c FROM entity_precreate_outbox WHERE name = ?')
      .get('RollbackOutboxTest') as { c: number };
    expect(outboxRows.c).toBe(0);
  });

  it('a PERMANENT contacts failure (bad-request) still aborts the commit before the tx opens', async () => {
    const list = () => Promise.resolve(page([], false));
    const create = () =>
      Promise.resolve<CallResult<{ data: ContactEntity; message: string }>>({
        kind: 'bad-request',
        pillar: 'contacts',
        message: 'entity type is not recognised',
      });
    const contacts = createContactsClient(() => stubHandle({ list, create }));
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab06';

    await expect(
      c.imports.commitImport({
        entities: [{ tempId, name: 'GenuineBug', type: 'company' }],
        transactions: [confirmed({ checksum: 'outbox-genuine-error' })],
      })
    ).rejects.toMatchObject({ status: 500 });

    const txnRows = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('outbox-genuine-error') as { c: number };
    expect(txnRows.c).toBe(0);
    const outboxRows = financeDb.raw
      .prepare('SELECT count(*) as c FROM entity_precreate_outbox')
      .get() as { c: number };
    expect(outboxRows.c).toBe(0);
  });
});

describe('imports.commitImport — retroactive reclassification', () => {
  it('reclassifies existing transactions a new rule now matches', async () => {
    const c = client();
    seedTransaction({ description: 'WOOLWORTHS 9999', checksum: 'pre-existing-chk-1' });

    const res = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'WOOLWORTHS',
                matchType: 'contains',
                entityId: 'woolworths-id',
                entityName: 'Woolworths',
                confidence: 0.95,
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ description: 'NEW IMPORT TXN', checksum: 'reclass-new' })],
    });

    expect(res.data.retroactiveReclassifications).toBe(1);
    const txn = financeDb.raw
      .prepare('SELECT entity_id, entity_name FROM transactions WHERE checksum = ?')
      .get('pre-existing-chk-1') as { entity_id: string | null; entity_name: string | null };
    expect(txn.entity_id).toBe('woolworths-id');
    expect(txn.entity_name).toBe('Woolworths');
  });

  it('excludes the current import batch from reclassification', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'COLES',
                matchType: 'contains',
                entityId: 'coles-id',
                entityName: 'Coles',
                confidence: 0.95,
              },
            },
          ],
        },
      ],
      transactions: [
        confirmed({ description: 'COLES SUPERMARKET', checksum: 'import-batch-chk-1' }),
      ],
    });
    expect(res.data.retroactiveReclassifications).toBe(0);
  });
});

describe('imports — AI seam', () => {
  it('keeps the categorizer disabled by default (no entity suggestion, zero counters)', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'COMPLETELY UNSEEN VENDOR', checksum: 'ai-seam-1' })],
      account: 'Amex',
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
    expect(result.aiUsage).toBeUndefined();
  });
});
