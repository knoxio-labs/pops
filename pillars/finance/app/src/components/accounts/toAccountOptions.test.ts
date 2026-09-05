import { describe, expect, it } from 'vitest';

import { NO_BALANCE, NO_IMPORT_STATUS } from '../../test-utils.js';
import { toAccountOptions } from './toAccountOptions';

import type { ApiAccount, ApiInstitution } from './toAccountOptions';

function account(overrides: Partial<ApiAccount> = {}): ApiAccount {
  return {
    id: 'a1',
    name: 'Everyday',
    institutionId: null,
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
    entityDisplayName: null,
    entityDisplayNameStale: false,
    balance: NO_BALANCE,
    importStatus: NO_IMPORT_STATUS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function institution(overrides: Partial<ApiInstitution> = {}): ApiInstitution {
  return {
    id: 'anz',
    name: 'ANZ',
    colour: '#0072ac',
    logoAssetId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toAccountOptions', () => {
  it('joins an account onto its institution by id', () => {
    const [option] = toAccountOptions([account({ institutionId: 'anz' })], [institution()]);
    expect(option?.institution).toEqual({ id: 'anz', name: 'ANZ', colour: '#0072ac' });
  });

  it('leaves institution undefined for an account with no institutionId', () => {
    const [option] = toAccountOptions([account({ institutionId: null })], [institution()]);
    expect(option?.institution).toBeUndefined();
  });

  it('leaves institution undefined when the referenced institution is not in the joined set', () => {
    // Guards a stale reference (e.g. a deleted institution the fixture forgot
    // to filter out) from throwing rather than degrading gracefully.
    const [option] = toAccountOptions([account({ institutionId: 'missing' })], [institution()]);
    expect(option?.institution).toBeUndefined();
  });

  it('resolves logoAssetId to the raw serving route', () => {
    const [option] = toAccountOptions(
      [account({ institutionId: 'anz' })],
      [institution({ logoAssetId: 'asset-1' })]
    );
    expect(option?.institution?.logoUrl).toBe('/finance-api/logos/asset-1');
  });

  it('leaves logoUrl unset when the institution has no logoAssetId', () => {
    const [option] = toAccountOptions(
      [account({ institutionId: 'anz' })],
      [institution({ logoAssetId: null })]
    );
    expect(option?.institution?.logoUrl).toBeUndefined();
  });

  it('reads archived from a non-null archivedAt', () => {
    const [active, archived] = toAccountOptions(
      [
        account({ id: 'a1', archivedAt: null }),
        account({ id: 'a2', archivedAt: '2026-06-01T00:00:00.000Z' }),
      ],
      []
    );
    expect(active?.archived).toBe(false);
    expect(archived?.archived).toBe(true);
  });

  it('preserves input order and count', () => {
    const options = toAccountOptions(
      [account({ id: 'a1' }), account({ id: 'a2' }), account({ id: 'a3' })],
      []
    );
    expect(options.map((o) => o.id)).toEqual(['a1', 'a2', 'a3']);
  });
});
