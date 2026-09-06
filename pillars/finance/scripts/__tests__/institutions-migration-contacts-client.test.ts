/**
 * Unit tests for `findEntityByName` in
 * `../institutions-migration-contacts-client.ts`. The SDK proxy is mocked —
 * this is about the name/alias matching logic, not the network.
 *
 * Mirrors `fetchByExactName` in `src/api/contacts/client.ts` (and its own
 * test coverage in `src/api/contacts/__tests__/client.test.ts`): an alias
 * counts as the entity's name, so a search that only ever saw `name` would
 * report a known bank as unknown and the migration would create a second,
 * duplicate `bank` entity for it (POPS-3062 review finding).
 */
import { describe, expect, it, vi } from 'vitest';

import type { CallResult } from '@pops/pillar-sdk/server';

type ContactsEntityShape = {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  avatarAssetId: string | null;
};

const list =
  vi.fn<
    (input: {
      search?: string;
      limit: number;
      offset: number;
    }) => Promise<CallResult<{ data: ContactsEntityShape[]; pagination: { hasMore: boolean } }>>
  >();

vi.mock('@pops/pillar-sdk/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pops/pillar-sdk/server')>();
  return {
    ...actual,
    pillar: (): unknown => ({ entities: { list } }),
  };
});

const { findEntityByName } = await import('../institutions-migration-contacts-client.js');

function entity(
  over: Partial<ContactsEntityShape> & { id: string; name: string }
): ContactsEntityShape {
  return {
    type: 'company',
    aliases: [],
    avatarAssetId: null,
    ...over,
  };
}

function onePage(data: ContactsEntityShape[]): CallResult<{
  data: ContactsEntityShape[];
  pagination: { hasMore: boolean };
}> {
  return { kind: 'ok', value: { data, pagination: { hasMore: false } } };
}

describe('findEntityByName', () => {
  it('matches by exact case-insensitive name', async () => {
    list.mockResolvedValue(onePage([entity({ id: 'anz-id', name: 'ANZ' })]));

    const found = await findEntityByName('anz');

    expect(found).toEqual({ id: 'anz-id', type: 'company', avatarAssetId: null });
  });

  it('resolves an entity matched only by an alias, not just its primary name', async () => {
    list.mockResolvedValue(
      onePage([
        entity({ id: 'bank-id', name: 'Commonwealth Bank', type: 'bank', aliases: ['CBA'] }),
      ])
    );

    const found = await findEntityByName('cba');

    expect(found).toEqual({ id: 'bank-id', type: 'bank', avatarAssetId: null });
  });

  it('prefers an exact name match over another entity carrying it as an alias', async () => {
    list.mockResolvedValue(
      onePage([
        entity({ id: 'alias-id', name: 'Other Co', aliases: ['Acme'] }),
        entity({ id: 'name-id', name: 'Acme' }),
      ])
    );

    const found = await findEntityByName('Acme');

    expect(found?.id).toBe('name-id');
  });

  it('returns null when neither the name nor any alias matches', async () => {
    list.mockResolvedValue(
      onePage([entity({ id: 'e1', name: 'Someone Else', aliases: ['Nope'] })])
    );

    await expect(findEntityByName('Acme')).resolves.toBeNull();
  });

  it('reports a non-bank entity matched via alias with the same shape as a name match, so the migrator treats it as a collision', async () => {
    list.mockResolvedValue(
      onePage([entity({ id: 'person-1', name: 'Jane Doe', type: 'person', aliases: ['Westpac'] })])
    );

    const found = await findEntityByName('Westpac');

    expect(found).toEqual({ id: 'person-1', type: 'person', avatarAssetId: null });
  });
});
