import { describe, expect, it } from 'vitest';

import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../../test-utils.js';
import { toAccountOptions } from './toAccountOptions';

import type { ApiAccount } from './toAccountOptions';

function account(overrides: Partial<ApiAccount> = {}): ApiAccount {
  return {
    id: 'a1',
    name: 'Everyday',
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
    entityDisplayName: null,
    entityDisplayNameStale: false,
    entityColour: null,
    entityAvatarAssetId: null,
    resolvedEntityId: null,
    balance: NO_BALANCE,
    importStatus: NO_IMPORT_STATUS,
    transactionCount: NO_TRANSACTION_COUNT,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toAccountOptions', () => {
  it('reads a contacts-resolved issuer straight off the account response', () => {
    const [option] = toAccountOptions([
      account({
        entityId: 'entity-anz',
        resolvedEntityId: 'entity-anz',
        entityDisplayName: 'ANZ',
        entityColour: '#0072ac',
      }),
    ]);
    expect(option?.institution).toEqual({ id: 'entity-anz', name: 'ANZ', colour: '#0072ac' });
  });

  it('resolves a contacts avatar asset id to the contacts-api avatar route', () => {
    const [option] = toAccountOptions([
      account({
        entityId: 'entity-anz',
        resolvedEntityId: 'entity-anz',
        entityDisplayName: 'ANZ',
        entityColour: '#0072ac',
        entityAvatarAssetId: 'avatar-1',
      }),
    ]);
    expect(option?.institution?.logoUrl).toBe('/contacts-api/entities/entity-anz/avatar');
  });

  it('leaves institution undefined for a cash account', () => {
    const [option] = toAccountOptions([account({ kind: 'cash' })]);
    expect(option?.institution).toBeUndefined();
  });

  it('leaves institution undefined for a person account even though entityDisplayName resolves', () => {
    const [option] = toAccountOptions([
      account({ kind: 'person', entityId: 'entity-alice', entityDisplayName: 'Alice' }),
    ]);
    expect(option?.institution).toBeUndefined();
  });

  it('leaves institution undefined for an issuer-bearing account linked to neither', () => {
    const [option] = toAccountOptions([account({ kind: 'checking' })]);
    expect(option?.institution).toBeUndefined();
  });

  it('reads archived from a non-null archivedAt', () => {
    const [active, archived] = toAccountOptions([
      account({ id: 'a1', archivedAt: null }),
      account({ id: 'a2', archivedAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(active?.archived).toBe(false);
    expect(archived?.archived).toBe(true);
  });

  it('preserves input order and count', () => {
    const options = toAccountOptions([
      account({ id: 'a1' }),
      account({ id: 'a2' }),
      account({ id: 'a3' }),
    ]);
    expect(options.map((o) => o.id)).toEqual(['a1', 'a2', 'a3']);
  });
});
