/**
 * Contacts pre-create outbox reconciler tests (issue #3683).
 *
 * Runs against a real on-disk finance.db (like `reconcile-cross-pillar.test.ts`)
 * so the reassignment SQL is exercised end-to-end across every table that can
 * hold a commit-time entity reference, plus an end-to-end path that drives a
 * real `commitImport` through a contacts outage and back.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  entityPrecreateOutboxService,
  importsService,
  openFinanceDb,
  transactionCorrectionsService,
  transactionTagRulesService,
  transactions,
  type OpenedFinanceDb,
} from '../../../db/index.js';
import { makeContactsFake, type ContactsFake } from '../../__tests__/contacts-fake.js';
import { commitImport } from '../../modules/imports/commit.js';
import {
  startReconcileContactsOutboxWorker,
  type ReconcileContactsOutboxHandle,
} from '../reconcile-contacts-outbox.js';

let tmpDir: string;
let opened: OpenedFinanceDb;

function seedOutboxRow(name: string, type = 'company'): string {
  const id = entityPrecreateOutboxService.buildPendingContactId();
  entityPrecreateOutboxService.enqueue(opened.db, { id, name, type });
  return id;
}

function seedTransactionWithEntity(checksum: string, entityId: string): void {
  importsService.insertImportTransaction(opened.db, {
    description: `TXN ${checksum}`,
    account: 'Amex',
    amount: -10,
    date: '2026-02-13',
    type: 'Expense',
    tags: [],
    entityId,
    entityName: null,
    location: null,
    rawRow: '{}',
    checksum,
  });
}

function getTransactionEntityId(checksum: string): string | null {
  const row = opened.db
    .select({ entityId: transactions.entityId })
    .from(transactions)
    .where(eq(transactions.checksum, checksum))
    .get();
  return row?.entityId ?? null;
}

function getOutboxRow(
  id: string
): entityPrecreateOutboxService.EntityPrecreateOutboxRow | undefined {
  return entityPrecreateOutboxService.listPending(opened.db).find((r) => r.id === id);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-reconcile-outbox-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('startReconcileContactsOutboxWorker', () => {
  it('resolves a pending row: creates the contact and reassigns entity_id everywhere it was written', async () => {
    const placeholderId = seedOutboxRow('Woolworths');
    seedTransactionWithEntity('outbox-txn-1', placeholderId);
    transactionCorrectionsService.createOrUpdateTransactionCorrection(opened.db, {
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'exact',
      entityId: placeholderId,
    });
    transactionTagRulesService.createTransactionTagRule(opened.db, {
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'exact',
      entityId: placeholderId,
      tags: ['Groceries'],
    });

    const contacts = makeContactsFake();
    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.resolved).toBe(1);
    expect(stats.stillPending).toBe(0);
    // The worker fires one reconciliation pass immediately on construction
    // (production wants an immediate pass, not a full interval's wait) which
    // races with this explicit `runOnce`; create-or-fetch-by-name absorbs the
    // overlap into a single real contact.
    expect(contacts.entities.filter((e) => e.name === 'Woolworths')).toHaveLength(1);

    const realId = contacts.entities.find((e) => e.name === 'Woolworths')?.id;
    expect(realId).toBeDefined();
    expect(getTransactionEntityId('outbox-txn-1')).toBe(realId);

    const correction = opened.raw
      .prepare('SELECT entity_id FROM transaction_corrections WHERE description_pattern = ?')
      .get('WOOLWORTHS') as { entity_id: string };
    expect(correction.entity_id).toBe(realId);

    const tagRule = opened.raw
      .prepare('SELECT entity_id FROM transaction_tag_rules WHERE description_pattern = ?')
      .get('WOOLWORTHS') as { entity_id: string };
    expect(tagRule.entity_id).toBe(realId);

    const outboxRow = opened.raw
      .prepare(
        'SELECT status, resolved_entity_id, resolved_at FROM entity_precreate_outbox WHERE id = ?'
      )
      .get(placeholderId) as { status: string; resolved_entity_id: string; resolved_at: string };
    expect(outboxRow.status).toBe('resolved');
    expect(outboxRow.resolved_entity_id).toBe(realId);
    expect(outboxRow.resolved_at).not.toBeNull();
  });

  it('contacts still down: row stays pending, attempts and lastError are recorded', async () => {
    const placeholderId = seedOutboxRow('Coles');
    const contacts = makeContactsFake({ unavailable: true });

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
    });
    const stats = await handle.runOnce();
    expect(stats.resolved).toBe(0);
    expect(stats.stillPending).toBe(1);

    let row = getOutboxRow(placeholderId);
    expect(row?.status).toBe('pending');
    // >=1 rather than an exact count: the worker's own immediate on-start
    // pass races with this explicit `runOnce` (see the resolved-row test),
    // and both attempts land on the same row while it's still down.
    expect(row?.attempts).toBeGreaterThanOrEqual(1);
    expect(row?.lastError).toContain('unavailable');
    expect(row?.lastAttemptAt).not.toBeNull();
    const attemptsAfterFirstRun = row?.attempts ?? 0;

    await handle.runOnce();
    handle.stop();
    row = getOutboxRow(placeholderId);
    expect(row?.attempts).toBeGreaterThan(attemptsAfterFirstRun);
  });

  it('de-dupes: two pending rows with the same name resolve to the same real contact once contacts recovers', async () => {
    const placeholder1 = seedOutboxRow('Coles');
    const placeholder2 = seedOutboxRow('Coles');
    seedTransactionWithEntity('dedupe-1', placeholder1);
    seedTransactionWithEntity('dedupe-2', placeholder2);

    const contacts = makeContactsFake();
    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.resolved).toBe(2);
    expect(contacts.entities.filter((e) => e.name === 'Coles')).toHaveLength(1);
    const realId = contacts.entities.find((e) => e.name === 'Coles')?.id;
    expect(getTransactionEntityId('dedupe-1')).toBe(realId);
    expect(getTransactionEntityId('dedupe-2')).toBe(realId);
  });

  it('end-to-end: a commit during a contacts outage recovers once the reconciler runs after contacts is back', async () => {
    const contacts: ContactsFake = makeContactsFake({ unavailable: true });
    const tempId = 'temp:entity:00000000-0000-0000-0000-0000000000e2';

    const commitResult = await commitImport(opened.db, contacts, {
      entities: [{ tempId, name: 'ACME', type: 'company' }],
      changeSets: [],
      tagRuleChangeSets: [],
      transactions: [
        {
          date: '2026-02-13',
          description: 'ACME CORP',
          amount: -20,
          account: 'Amex',
          rawRow: '{}',
          checksum: 'e2e-outbox-1',
          entityId: tempId,
          entityName: 'ACME',
        },
      ],
    });

    expect(commitResult.transactionsImported).toBe(1);
    expect(commitResult.entitiesCreated).toBe(0);
    const placeholderId = getTransactionEntityId('e2e-outbox-1');
    expect(placeholderId).toMatch(/^pending:contact:/);

    contacts.setUnavailable(false);
    const handle: ReconcileContactsOutboxHandle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.resolved).toBe(1);
    const realId = contacts.entities.find((e) => e.name === 'ACME')?.id;
    expect(realId).toBeDefined();
    expect(getTransactionEntityId('e2e-outbox-1')).toBe(realId);
  });

  it('reschedules on a recursive setTimeout and stops cleanly', async () => {
    seedOutboxRow('Timer Co');
    // Stays unavailable so the row never resolves out of the work set — each
    // tick re-attempts it, mirroring the cross-pillar worker's timer test.
    const contacts = makeContactsFake({ unavailable: true });

    vi.useFakeTimers();
    try {
      const handle = startReconcileContactsOutboxWorker({
        db: opened.db,
        contacts,
        intervalMs: 1_000,
      });

      await vi.runOnlyPendingTimersAsync();
      const firstCount = contacts.created.length;
      expect(firstCount).toBeGreaterThanOrEqual(1);

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      const beforeStop = contacts.created.length;

      handle.stop();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(contacts.created.length).toBe(beforeStop);
    } finally {
      vi.useRealTimers();
    }
  });
});
