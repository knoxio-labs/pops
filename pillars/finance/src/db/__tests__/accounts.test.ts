/**
 * Invariant tests for the accounts service against an in-memory SQLite
 * carrying the migrated finance schema — DB + service layer only.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AccountCashCurrencyConflictError,
  AccountNameConflictError,
  AccountNotFoundError,
  NonPersonAccountHasEntityError,
  PersonAccountEntityConflictError,
  PersonAccountRequiresEntityError,
  ReservedAccountKindError,
} from '../errors.js';
import { accounts } from '../schema.js';
import { resolvePendingPersonAccountEntity } from '../services/account-entity-resolution.js';
import {
  archiveAccount,
  createAccount,
  getAccount,
  listAccounts,
  reorderAccounts,
  updateAccount,
} from '../services/accounts.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

const DEFAULT_PAGE = { limit: 50, offset: 0 };

describe('listAccounts', () => {
  it('starts with the two migration-seeded accounts, ordered by displayOrder then name', () => {
    const db = freshDb();
    const { rows, total } = listAccounts(db, DEFAULT_PAGE);
    expect(rows.map((a) => a.name)).toEqual(['ANZ Credit Card', 'Amex']);
    expect(total).toBe(2);
  });

  it('places a later create after the seeded rows at the same displayOrder, sorted by name', () => {
    const db = freshDb();
    createAccount(db, { name: 'Zzz Cash', kind: 'cash', currency: 'AUD' });

    const { rows } = listAccounts(db, DEFAULT_PAGE);
    expect(rows.map((a) => a.name)).toEqual(['ANZ Credit Card', 'Amex', 'Zzz Cash']);
  });

  it('filters by search substring, case-insensitively', () => {
    const db = freshDb();
    createAccount(db, { name: 'Travel Wallet', kind: 'cash', currency: 'AUD' });

    const { rows, total } = listAccounts(db, { ...DEFAULT_PAGE, search: 'wallet' });
    expect(total).toBe(1);
    expect(rows.map((a) => a.name)).toEqual(['Travel Wallet']);
  });

  it('filters by exact kind', () => {
    const db = freshDb();
    createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });

    const { rows, total } = listAccounts(db, { ...DEFAULT_PAGE, kind: 'cash' });
    expect(total).toBe(1);
    expect(rows[0]?.name).toBe('Wallet');
  });

  it('filters to archived-only or active-only accounts', () => {
    const db = freshDb();
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    archiveAccount(db, created.id);

    const archivedOnly = listAccounts(db, { ...DEFAULT_PAGE, archived: true });
    expect(archivedOnly.rows.map((a) => a.id)).toEqual([created.id]);

    const activeOnly = listAccounts(db, { ...DEFAULT_PAGE, archived: false });
    expect(activeOnly.rows.map((a) => a.id)).not.toContain(created.id);
    expect(activeOnly.total).toBe(2);
  });

  it('paginates with limit/offset while reporting the true total', () => {
    const db = freshDb();
    const page1 = listAccounts(db, { limit: 1, offset: 0 });
    expect(page1.rows).toHaveLength(1);
    expect(page1.total).toBe(2);

    const page2 = listAccounts(db, { limit: 1, offset: 1 });
    expect(page2.rows).toHaveLength(1);
    expect(page2.rows[0]?.name).not.toBe(page1.rows[0]?.name);
  });
});

describe('createAccount', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts an account with no institution for a cash kind', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });

    expect(created.name).toBe('Wallet');
    expect(created.kind).toBe('cash');
    expect(created.currency).toBe('AUD');
    expect(created.institutionId).toBeNull();
    expect(created.archivedAt).toBeNull();
    expect(created.entityId).toBeNull();
    expect(created.displayOrder).toBe(0);
  });

  it('round-trips through getAccount', () => {
    const created = createAccount(db, { name: 'Savings A', kind: 'savings', currency: 'AUD' });
    expect(getAccount(db, created.id).name).toBe('Savings A');
  });

  it('throws AccountNameConflictError for a duplicate name', () => {
    createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    // A different kind/currency isolates this from the (kind, currency) cash
    // conflict below — this asserts the name index specifically.
    expect(() => createAccount(db, { name: 'Wallet', kind: 'savings', currency: 'AUD' })).toThrow(
      AccountNameConflictError
    );
  });

  it('throws AccountNameConflictError for the seeded "Amex" name, case-insensitively', () => {
    expect(() => createAccount(db, { name: 'amex', kind: 'credit-card', currency: 'AUD' })).toThrow(
      AccountNameConflictError
    );
  });

  describe('the (kind=cash, currency) partial unique constraint', () => {
    it('rejects a second cash account in the same currency', () => {
      createAccount(db, { name: 'Wallet AUD', kind: 'cash', currency: 'AUD' });
      expect(() =>
        createAccount(db, { name: 'Wallet AUD 2', kind: 'cash', currency: 'AUD' })
      ).toThrow(AccountCashCurrencyConflictError);
    });

    it('allows two cash accounts in different currencies', () => {
      createAccount(db, { name: 'Wallet AUD', kind: 'cash', currency: 'AUD' });
      expect(() =>
        createAccount(db, { name: 'Wallet Points', kind: 'cash', currency: 'QFF' })
      ).not.toThrow();
    });

    it('allows two non-cash accounts with the same kind and currency', () => {
      createAccount(db, { name: 'Card A', kind: 'credit-card', currency: 'AUD' });
      expect(() =>
        createAccount(db, { name: 'Card B', kind: 'credit-card', currency: 'AUD' })
      ).not.toThrow();
    });
  });

  describe('reserved kinds', () => {
    it.each(['shared', 'loan', 'novated-lease', 'crypto', 'other'] as const)(
      'rejects kind %s with ReservedAccountKindError',
      (kind) => {
        expect(() => createAccount(db, { name: 'Reserved', kind, currency: 'AUD' })).toThrow(
          ReservedAccountKindError
        );
      }
    );

    it.each(['checking', 'savings', 'credit-card', 'cash', 'gift-card'] as const)(
      'still allows day-one kind %s',
      (kind, index) => {
        expect(() =>
          createAccount(db, { name: `Day one ${index}`, kind, currency: 'AUD' })
        ).not.toThrow();
      }
    );

    // `person` needs an `entityId` (POPS-2771) — see the dedicated
    // `person account entity invariant` suite below for its own coverage.
    it('still allows day-one kind person, given an entityId', () => {
      expect(() =>
        createAccount(db, {
          name: 'Day one person',
          kind: 'person',
          currency: 'AUD',
          entityId: 'e-1',
        })
      ).not.toThrow();
    });
  });
});

describe('updateAccount', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('patches the supplied fields and leaves the rest alone', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    const updated = updateAccount(db, created.id, { displayOrder: 5 });

    expect(updated.displayOrder).toBe(5);
    expect(updated.name).toBe('Wallet');
  });

  it('rejects patching kind into a reserved value, same as create', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    expect(() => updateAccount(db, created.id, { kind: 'crypto' })).toThrow(
      ReservedAccountKindError
    );
    expect(getAccount(db, created.id).kind).toBe('cash');
  });

  it('allows patching unrelated fields on an account that already has a reserved kind', () => {
    // Simulates a row created before ReservedAccountKindError shipped —
    // createAccount itself can no longer produce one, so insert directly.
    const id = crypto.randomUUID();
    db.insert(accounts)
      .values({ id, name: 'Legacy crypto', kind: 'crypto', currency: 'AUD' })
      .run();

    const updated = updateAccount(db, id, { displayOrder: 3 });
    expect(updated.kind).toBe('crypto');
    expect(updated.displayOrder).toBe(3);

    const reaffirmed = updateAccount(db, id, { kind: 'crypto', displayOrder: 4 });
    expect(reaffirmed.kind).toBe('crypto');
    expect(reaffirmed.displayOrder).toBe(4);
  });

  it('throws AccountNotFoundError for a missing id', () => {
    expect(() => updateAccount(db, 'missing-id', { displayOrder: 1 })).toThrow(
      AccountNotFoundError
    );
  });

  it('throws AccountNameConflictError renaming into an existing name', () => {
    createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    const other = createAccount(db, { name: 'Other', kind: 'savings', currency: 'AUD' });

    expect(() => updateAccount(db, other.id, { name: 'wallet' })).toThrow(AccountNameConflictError);
  });

  it('throws AccountCashCurrencyConflictError moving a second account into (cash, AUD)', () => {
    createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    const other = createAccount(db, { name: 'Card', kind: 'credit-card', currency: 'AUD' });

    expect(() => updateAccount(db, other.id, { kind: 'cash' })).toThrow(
      AccountCashCurrencyConflictError
    );
  });

  it('unarchives by patching archivedAt back to null', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    archiveAccount(db, created.id);

    const restored = updateAccount(db, created.id, { archivedAt: null });
    expect(restored.archivedAt).toBeNull();
  });
});

describe('archiveAccount', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('sets archivedAt on an active account', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    expect(created.archivedAt).toBeNull();

    const archived = archiveAccount(db, created.id);
    expect(archived.archivedAt).not.toBeNull();
  });

  it('is idempotent — archiving twice keeps the original timestamp', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    const first = archiveAccount(db, created.id);
    const second = archiveAccount(db, created.id);

    expect(second.archivedAt).toBe(first.archivedAt);
  });

  it('throws AccountNotFoundError for a missing id', () => {
    expect(() => archiveAccount(db, 'missing-id')).toThrow(AccountNotFoundError);
  });

  it('does not remove the row — transactions can still reference it', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    archiveAccount(db, created.id);

    expect(() => getAccount(db, created.id)).not.toThrow();
  });
});

describe('reorderAccounts', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('applies every entry in the batch', () => {
    const a = createAccount(db, { name: 'Alpha', kind: 'cash', currency: 'AUD' });
    const b = createAccount(db, { name: 'Beta', kind: 'savings', currency: 'AUD' });

    const result = reorderAccounts(db, [
      { id: a.id, displayOrder: 5 },
      { id: b.id, displayOrder: 1 },
    ]);

    expect(result.find((r) => r.id === a.id)?.displayOrder).toBe(5);
    expect(result.find((r) => r.id === b.id)?.displayOrder).toBe(1);
    expect(getAccount(db, a.id).displayOrder).toBe(5);
    expect(getAccount(db, b.id).displayOrder).toBe(1);
  });

  it('rejects the whole batch and leaves display_order untouched when one id is unknown', () => {
    const a = createAccount(db, { name: 'Alpha', kind: 'cash', currency: 'AUD' });
    const b = createAccount(db, { name: 'Beta', kind: 'savings', currency: 'AUD' });

    expect(() =>
      reorderAccounts(db, [
        { id: a.id, displayOrder: 5 },
        { id: 'missing-id', displayOrder: 1 },
        { id: b.id, displayOrder: 2 },
      ])
    ).toThrow(AccountNotFoundError);

    expect(getAccount(db, a.id).displayOrder).toBe(0);
    expect(getAccount(db, b.id).displayOrder).toBe(0);
  });
});

describe('person account entity invariant (POPS-2771)', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('rejects a person account with no entityId and no allowPendingEntity', () => {
    expect(() => createAccount(db, { name: 'Alice', kind: 'person', currency: 'AUD' })).toThrow(
      PersonAccountRequiresEntityError
    );
  });

  it('accepts a person account with an entityId', () => {
    const created = createAccount(db, {
      name: 'Alice',
      kind: 'person',
      currency: 'AUD',
      entityId: 'entity-alice',
    });
    expect(created.entityId).toBe('entity-alice');
  });

  it('creates the account with a null entityId when allowPendingEntity is set', () => {
    const created = createAccount(
      db,
      { name: 'Alice', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );
    expect(created.entityId).toBeNull();
  });

  it.each(['checking', 'savings', 'credit-card', 'cash', 'gift-card'] as const)(
    'rejects a non-person account (%s) carrying an entityId',
    (kind) => {
      expect(() =>
        createAccount(db, { name: 'Not a person', kind, currency: 'AUD', entityId: 'entity-x' })
      ).toThrow(NonPersonAccountHasEntityError);
    }
  );

  it('rejects a second person account for the same (entityId, currency) pair', () => {
    createAccount(db, {
      name: 'Alice',
      kind: 'person',
      currency: 'AUD',
      entityId: 'entity-alice',
    });

    expect(() =>
      createAccount(db, {
        name: 'Alice again',
        kind: 'person',
        currency: 'AUD',
        entityId: 'entity-alice',
      })
    ).toThrow(PersonAccountEntityConflictError);
  });

  it('allows the same contact to hold person accounts in two different currencies', () => {
    createAccount(db, {
      name: 'Alice AUD',
      kind: 'person',
      currency: 'AUD',
      entityId: 'entity-alice',
    });
    expect(() =>
      createAccount(db, {
        name: 'Alice USD',
        kind: 'person',
        currency: 'USD',
        entityId: 'entity-alice',
      })
    ).not.toThrow();
  });

  it('allows two different pending (entityId = null) person accounts to coexist', () => {
    createAccount(
      db,
      { name: 'Alice', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );
    expect(() =>
      createAccount(
        db,
        { name: 'Bob', kind: 'person', currency: 'AUD' },
        { allowPendingEntity: true }
      )
    ).not.toThrow();
  });

  it('updateAccount rejects turning kind into person with no entityId set or supplied', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    expect(() => updateAccount(db, created.id, { kind: 'person' })).toThrow(
      PersonAccountRequiresEntityError
    );
  });

  it('updateAccount rejects setting an entityId on a non-person account', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    expect(() => updateAccount(db, created.id, { entityId: 'entity-x' })).toThrow(
      NonPersonAccountHasEntityError
    );
  });

  it('updateAccount allows turning kind into person when entityId is supplied in the same patch', () => {
    const created = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    const updated = updateAccount(db, created.id, { kind: 'person', entityId: 'entity-x' });
    expect(updated.kind).toBe('person');
    expect(updated.entityId).toBe('entity-x');
  });

  it('updateAccount allows patching an unrelated field on a still-pending person account', () => {
    const created = createAccount(
      db,
      { name: 'Alice', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );
    expect(created.entityId).toBeNull();

    const updated = updateAccount(db, created.id, { displayOrder: 3 });
    expect(updated.displayOrder).toBe(3);
    expect(updated.kind).toBe('person');
    expect(updated.entityId).toBeNull();
  });
});

describe('resolvePendingPersonAccountEntity', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('fills in a pending person account entityId', () => {
    const created = createAccount(
      db,
      { name: 'Alice', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );
    expect(created.entityId).toBeNull();

    const resolved = resolvePendingPersonAccountEntity(db, created.id, 'entity-alice');
    expect(resolved.entityId).toBe('entity-alice');
  });

  it('is idempotent — a second call against an already-resolved row is a no-op', () => {
    const created = createAccount(
      db,
      { name: 'Alice', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );
    resolvePendingPersonAccountEntity(db, created.id, 'entity-alice');

    expect(() =>
      resolvePendingPersonAccountEntity(db, created.id, 'entity-someone-else')
    ).not.toThrow();
    expect(getAccount(db, created.id).entityId).toBe('entity-alice');
  });

  it('throws AccountNotFoundError for an unknown account id', () => {
    expect(() => resolvePendingPersonAccountEntity(db, 'missing-id', 'entity-alice')).toThrow(
      AccountNotFoundError
    );
  });

  it('throws PersonAccountEntityConflictError when two pending accounts resolve to the same (entityId, currency)', () => {
    const first = createAccount(
      db,
      { name: 'Alice A', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );
    const second = createAccount(
      db,
      { name: 'Alice B', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );

    resolvePendingPersonAccountEntity(db, first.id, 'entity-alice');
    expect(() => resolvePendingPersonAccountEntity(db, second.id, 'entity-alice')).toThrow(
      PersonAccountEntityConflictError
    );
    // The losing row keeps its NULL entityId rather than landing a bad write.
    expect(getAccount(db, second.id).entityId).toBeNull();
  });
});
