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
  accountsService,
  entityPrecreateOutboxService,
  importsService,
  openFinanceDb,
  transactionCorrectionsService,
  transactionTagRulesService,
  transactions,
  type OpenedFinanceDb,
} from '../../../db/index.js';
import { makeContactsFake, type ContactsFake } from '../../__tests__/contacts-fake.js';
import { ContactsPermanentError } from '../../contacts/errors.js';
import { commitImport } from '../../modules/imports/commit.js';
import {
  startReconcileContactsOutboxWorker,
  type ReconcileContactsOutboxHandle,
} from '../reconcile-contacts-outbox.js';

import type { EntityType } from '../../../db/entity-types.js';

let tmpDir: string;
let opened: OpenedFinanceDb;

function seedOutboxRow(name: string, type: EntityType = 'company'): string {
  const id = entityPrecreateOutboxService.buildPendingContactId();
  entityPrecreateOutboxService.enqueue(opened.db, { id, name, type });
  return id;
}

function seedTransactionWithEntity(checksum: string, entityId: string): void {
  importsService.insertImportTransaction(opened.db, {
    description: `TXN ${checksum}`,
    account: 'Amex',
    amountCents: -1000,
    date: '2026-02-13',
    type: 'purchase',
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

  it('dead-letters a row once it hits maxAttempts, and stops retrying it', async () => {
    const placeholderId = seedOutboxRow('DeadLetterCo');
    const contacts = makeContactsFake({ unavailable: true });

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
      maxAttempts: 2,
    });
    // The worker's own immediate on-start pass is attempt 1 (races this
    // explicit `runOnce`, as in the tests above) — drive enough passes that
    // the row is guaranteed to cross `maxAttempts` regardless of how that
    // race lands.
    await handle.runOnce();
    await handle.runOnce();
    handle.stop();

    const row = opened.raw
      .prepare('SELECT status, attempts FROM entity_precreate_outbox WHERE id = ?')
      .get(placeholderId) as { status: string; attempts: number };
    expect(row.status).toBe('failed');
    expect(row.attempts).toBeGreaterThanOrEqual(2);

    // A dead-lettered row is no longer selected by `listPending` — further
    // ticks of the SAME worker must not touch it (attempts stays put). A new
    // worker is a different matter: see the boot-requeue test below.
    const attemptsAtDeadLetter = row.attempts;
    await handle.runOnce();

    const rowAfter = opened.raw
      .prepare('SELECT status, attempts FROM entity_precreate_outbox WHERE id = ?')
      .get(placeholderId) as { status: string; attempts: number };
    expect(rowAfter.status).toBe('failed');
    expect(rowAfter.attempts).toBe(attemptsAtDeadLetter);
  });

  /**
   * POPS-2690. A dead-letter says "an operator needs to look at this", and the
   * operator's fix — a mounted secret, a granted scope, a redeployed contacts —
   * arrives as a restart. Without the boot requeue the fix is not retroactive:
   * the placeholder ids the row left on real transactions and correction rules
   * stay wrong forever.
   */
  it('requeues dead-lettered rows on boot, so a fixed cause is applied retroactively', async () => {
    const placeholderId = seedOutboxRow('RequeueCo');
    seedTransactionWithEntity('requeue-txn-1', placeholderId);
    const contacts = makeContactsFake({ unavailable: true });

    const downHandle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
      maxAttempts: 2,
    });
    await downHandle.runOnce();
    await downHandle.runOnce();
    downHandle.stop();
    expect(
      opened.raw
        .prepare('SELECT status FROM entity_precreate_outbox WHERE id = ?')
        .get(placeholderId)
    ).toEqual({ status: 'failed' });

    // The cause is fixed, and the process restarts.
    contacts.setUnavailable(false);
    const upHandle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
      maxAttempts: 2,
    });
    await upHandle.runOnce();
    upHandle.stop();

    const resolved = opened.raw
      .prepare('SELECT status, resolved_entity_id FROM entity_precreate_outbox WHERE id = ?')
      .get(placeholderId) as { status: string; resolved_entity_id: string | null };
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_entity_id).not.toBeNull();
    expect(getTransactionEntityId('requeue-txn-1')).toBe(resolved.resolved_entity_id);
  });

  /**
   * POPS-2690. The boot requeue's premise is that a restart is the operator
   * attention a dead-letter asked for. That is false for a request contacts
   * refuses on its own terms — no restart changes its verdict — so such a row
   * must dead-letter on the first refusal and stay dead through every
   * subsequent boot, or the requeue re-attempts it `maxAttempts` times per
   * deploy forever.
   */
  it('never requeues a row contacts refused, and gives up on it immediately', async () => {
    const placeholderId = seedOutboxRow('Refused Co');
    const contacts: ContactsFake = {
      ...makeContactsFake(),
      createOrFetchByName: () => Promise.reject(new ContactsPermanentError('bad-request')),
    };

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
      maxAttempts: 50,
    });
    await handle.runOnce();
    handle.stop();

    const row = opened.raw
      .prepare(
        'SELECT status, attempts, permanent_failure FROM entity_precreate_outbox WHERE id = ?'
      )
      .get(placeholderId) as { status: string; attempts: number; permanent_failure: number };
    expect(row.status).toBe('failed');
    expect(row.attempts).toBeLessThanOrEqual(2);
    expect(row.permanent_failure).toBe(1);

    // The restart that heals an outage-dead row must leave this one alone.
    const rebooted = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
      maxAttempts: 50,
    });
    rebooted.stop();

    expect(
      opened.raw
        .prepare('SELECT status FROM entity_precreate_outbox WHERE id = ?')
        .get(placeholderId)
    ).toEqual({ status: 'failed' });
  });

  /**
   * POPS-2690. `no-credential` means nothing was sent — contacts was never
   * asked. Charging the row an attempt for it burns the whole cap on a fault
   * only a redeploy can clear, which is how 44 production rows dead-lettered
   * in under an hour.
   */
  it('defers on a missing service-account key instead of spending an attempt', async () => {
    const placeholderId = seedOutboxRow('NoKeyCo');
    const contacts = makeContactsFake({ unavailable: true, unavailableDetail: 'no-credential' });

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
      maxAttempts: 2,
    });
    const stats = await handle.runOnce();
    await handle.runOnce();
    await handle.runOnce();
    handle.stop();

    expect(stats.deferred).toBe(1);
    expect(stats.failed).toBe(0);
    const row = opened.raw
      .prepare('SELECT status, attempts, last_error FROM entity_precreate_outbox WHERE id = ?')
      .get(placeholderId) as { status: string; attempts: number; last_error: string | null };
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
    expect(row.last_error).toContain('no-credential');
  });

  /**
   * The credential is a fact about the process, not about a row: one refusal
   * settles the tick. Without the early exit every row is walked (and stamped)
   * on every tick for a call that cannot be made.
   */
  it('stops the tick at the first missing-credential refusal', async () => {
    seedOutboxRow('NoKeyCo A');
    seedOutboxRow('NoKeyCo B');
    seedOutboxRow('NoKeyCo C');
    const contacts = makeContactsFake({ unavailable: true, unavailableDetail: 'no-credential' });

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
    });
    contacts.created.length = 0;
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.deferred).toBe(3);
    expect(contacts.created).toHaveLength(1);
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

describe('recordAttemptFailure concurrency guard', () => {
  function readRow(id: string): {
    status: string;
    attempts: number;
    last_error: string | null;
    resolved_entity_id: string | null;
  } {
    return opened.raw
      .prepare(
        'SELECT status, attempts, last_error, resolved_entity_id FROM entity_precreate_outbox WHERE id = ?'
      )
      .get(id) as {
      status: string;
      attempts: number;
      last_error: string | null;
      resolved_entity_id: string | null;
    };
  }

  it('leaves a row a concurrent pass already resolved untouched', () => {
    const id = seedOutboxRow('RaceCo');
    entityPrecreateOutboxService.markResolved(
      opened.db,
      id,
      'real-entity-1',
      '2026-07-06T00:00:00.000Z'
    );

    const outcome = entityPrecreateOutboxService.recordAttemptFailure(opened.db, id, {
      nowIso: '2026-07-06T00:00:01.000Z',
      error: 'contacts unavailable',
      maxAttempts: 1,
    });

    expect(outcome).toBe('pending');
    const row = readRow(id);
    expect(row.status).toBe('resolved');
    expect(row.attempts).toBe(0);
    expect(row.last_error).toBeNull();
    expect(row.resolved_entity_id).toBe('real-entity-1');
  });

  it('does not re-fail or re-bump a row a concurrent pass already dead-lettered', () => {
    const id = seedOutboxRow('DeadRaceCo');
    const first = entityPrecreateOutboxService.recordAttemptFailure(opened.db, id, {
      nowIso: '2026-07-06T00:00:00.000Z',
      error: 'boom',
      maxAttempts: 1,
    });
    expect(first).toBe('failed');

    const second = entityPrecreateOutboxService.recordAttemptFailure(opened.db, id, {
      nowIso: '2026-07-06T00:00:02.000Z',
      error: 'boom again',
      maxAttempts: 1,
    });

    expect(second).toBe('pending');
    const row = readRow(id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe('boom');
  });
});

describe('startReconcileContactsOutboxWorker — pending person accounts (POPS-2771)', () => {
  function seedPendingPersonAccount(name: string, currency = 'AUD'): string {
    const account = accountsService.createAccount(
      opened.db,
      { name, kind: 'person', currency },
      { allowPendingEntity: true }
    );
    expect(account.entityId).toBeNull();
    return account.id;
  }

  /**
   * `createAccount`'s `allowPendingEntity` path names the outbox row after
   * the account's own (globally-unique) name, so two accounts can never
   * share an outbox `name` through the public API alone. This helper
   * overwrites the outbox row's `name` after the fact, to exercise the case
   * two DIFFERENTLY-named accounts both happen to resolve to the same real
   * contact (e.g. one by exact name, one by an alias the fake doesn't model,
   * or simply because contacts already held that contact under a name
   * neither account literally repeats).
   */
  function seedPendingPersonAccountResolvingAs(
    accountName: string,
    outboxName: string,
    currency = 'AUD'
  ): string {
    const id = seedPendingPersonAccount(accountName, currency);
    opened.raw
      .prepare('UPDATE entity_precreate_outbox SET name = ? WHERE account_id = ?')
      .run(outboxName, id);
    return id;
  }

  it('drains a pending person account create: contacts up resolves entityId', async () => {
    const accountId = seedPendingPersonAccount('Alice');
    const contacts = makeContactsFake();

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.resolved).toBe(1);
    const realId = contacts.entities.find((e) => e.name === 'Alice')?.id;
    expect(realId).toBeDefined();
    expect(accountsService.getAccount(opened.db, accountId).entityId).toBe(realId);
  });

  it('contacts still down: the account stays pending, entityId stays null', async () => {
    const accountId = seedPendingPersonAccount('Bob');
    const contacts = makeContactsFake({ unavailable: true });

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
    });
    const stats = await handle.runOnce();
    handle.stop();

    expect(stats.resolved).toBe(0);
    expect(accountsService.getAccount(opened.db, accountId).entityId).toBeNull();
  });

  /**
   * Two DIFFERENTLY-named person accounts (account names are globally
   * unique, so they can never literally match) both resolve to the SAME real
   * contact + currency — exactly the scenario the ticket's uniqueness index
   * exists for. The first resolution wins; the second is a genuine
   * (entityId, currency) collision the outbox cannot retry its way out of,
   * so it dead-letters rather than looping forever.
   */
  it('dead-letters the second of two pending person accounts that resolve to the same (entityId, currency)', async () => {
    const firstId = seedPendingPersonAccountResolvingAs('Carol A', 'Carol');
    const secondId = seedPendingPersonAccountResolvingAs('Carol B', 'Carol');
    const contacts = makeContactsFake();

    const handle = startReconcileContactsOutboxWorker({
      db: opened.db,
      contacts,
      intervalMs: 1_000_000,
      maxAttempts: 50,
    });
    // As in the placeholder-based tests above, the worker's own immediate
    // on-start pass races with this explicit `runOnce` — either one (or a
    // split between them) can end up resolving/dead-lettering the two rows,
    // so assert on the settled DB state rather than this call's own stats.
    await handle.runOnce();
    handle.stop();

    const realId = contacts.entities.find((e) => e.name === 'Carol')?.id;
    const firstAccount = accountsService.getAccount(opened.db, firstId);
    const secondAccount = accountsService.getAccount(opened.db, secondId);
    // Exactly one of the two resolved (order between them isn't guaranteed).
    const resolvedAccount = firstAccount.entityId !== null ? firstAccount : secondAccount;
    const stillPendingAccount = firstAccount.entityId !== null ? secondAccount : firstAccount;
    expect(resolvedAccount.entityId).toBe(realId);
    expect(stillPendingAccount.entityId).toBeNull();

    const outboxRows = opened.raw
      .prepare(
        "SELECT status, permanent_failure FROM entity_precreate_outbox WHERE account_id = ? AND status = 'failed'"
      )
      .all(stillPendingAccount.id) as { status: string; permanent_failure: number }[];
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.permanent_failure).toBe(1);
  });
});
