/**
 * Merchant matching, where the cost of being wrong is asymmetric.
 *
 * A missed match costs a link. A wrong match silently files someone else's
 * spending under this merchant, and looks perfectly ordinary while doing
 * it. Every test here is about preferring the first.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  chooseMerchant,
  createMerchantResolver,
  foldName,
  isSameMerchant,
  searchSeed,
  type ContactsRouter,
} from '../merchant.js';

import type {
  CallDynamicFn,
  CallResult,
  CallableProcedure,
  PillarHandle,
} from '@pops/pillar-sdk/client';

const entity = (id: string, name: string, aliases: string[] = [], type = 'company') => ({
  id,
  name,
  aliases,
  type,
});

function handleWithList(
  fn: (input: Parameters<ContactsRouter['entities']['list']>[0]) => Promise<CallResult<unknown>>
): PillarHandle<ContactsRouter> {
  const list: CallableProcedure<
    Parameters<ContactsRouter['entities']['list']>,
    unknown
  > = Object.assign(fn, {
    orThrow: async (input: Parameters<ContactsRouter['entities']['list']>[0]) => {
      const result = await fn(input);
      if (result.kind !== 'ok') throw new Error(result.kind);
      return result.value;
    },
  });
  const callDynamic: CallDynamicFn = () => {
    throw new Error('Unexpected dynamic call');
  };
  return { entities: { list }, callDynamic };
}

const handleReturning = (value: unknown): PillarHandle<ContactsRouter> =>
  handleWithList(async () => ({ kind: 'ok', value }));

const handleFailing = (): PillarHandle<ContactsRouter> =>
  handleWithList(async () => ({
    kind: 'unavailable',
    pillar: 'contacts',
    reason: 'not-registered',
  }));

describe('folding a name', () => {
  it('sees through the ways a receipt and a contact list differ', () => {
    // A receipt shouts; a contact list is written by a person.
    expect(foldName('Carrefour')).toBe(foldName('CARREFOUR'));
    expect(foldName('Bunnings.')).toBe(foldName('Bunnings'));
    expect(foldName('  Coles   Supermarkets ')).toBe('COLES SUPERMARKETS');
  });

  it('folds diacritics, because a till printer often cannot render them', () => {
    expect(foldName('Café Züri')).toBe('CAFE ZURI');
    expect(foldName('CAFE ZURI')).toBe(foldName('Café Züri'));
  });
});

describe('seeding the search', () => {
  it('takes the most identifying word, because the producer matches substrings one way', () => {
    // Asking contacts for "Bunnings Warehouse" never finds "Bunnings".
    expect(searchSeed('Bunnings Warehouse')).toBe('BUNNINGS');
    expect(searchSeed('Carrefour Market')).toBe('CARREFOUR');
  });

  it('skips words that identify nothing', () => {
    expect(searchSeed('The Coffee Company')).toBe('COFFEE');
    expect(searchSeed('Woolworths Pty Ltd')).toBe('WOOLWORTHS');
  });

  it('gives up rather than searching for noise', () => {
    expect(searchSeed('Pty Ltd')).toBeNull();
    expect(searchSeed('   ')).toBeNull();
    expect(searchSeed('A Co')).toBeNull();
  });
});

describe('deciding whether a candidate is the merchant', () => {
  it('accepts the same name', () => {
    expect(isSameMerchant('Bunnings Warehouse', 'Bunnings Warehouse')).toBe(true);
    expect(isSameMerchant('CARREFOUR', 'Carrefour')).toBe(true);
  });

  it('accepts an entity whose name is the leading words of the receipt', () => {
    // A trading name commonly carries a suffix the entity does not.
    expect(isSameMerchant('Bunnings Warehouse', 'Bunnings')).toBe(true);
    expect(isSameMerchant('Woolworths Metro Newtown', 'Woolworths')).toBe(true);
  });

  it('refuses the reverse, because a suffix can be a different business', () => {
    // `Coles Express` is a petrol station. Matching a Coles receipt to it
    // files groceries as fuel, and nothing about the purchase looks wrong.
    expect(isSameMerchant('Coles', 'Coles Express')).toBe(false);
    expect(isSameMerchant('Woolworths', 'Woolworths Metro')).toBe(false);
  });

  it('refuses a name that merely shares a prefix mid-word', () => {
    // `Bun` must not match `Bunnings`, and `Bunnings` must not match
    // `Bunningsworth`.
    expect(isSameMerchant('Bunningsworth Hardware', 'Bunnings')).toBe(false);
    expect(isSameMerchant('Bun', 'Bunnings')).toBe(false);
  });

  it('refuses an empty name on either side', () => {
    expect(isSameMerchant('', 'Bunnings')).toBe(false);
    expect(isSameMerchant('Bunnings', '   ')).toBe(false);
  });
});

describe('choosing among candidates', () => {
  it('takes the one that matches', () => {
    const chosen = chooseMerchant('Bunnings Warehouse', [
      entity('e1', 'Coles'),
      entity('e2', 'Bunnings'),
      entity('e3', 'Officeworks'),
    ]);
    expect(chosen).toBe('e2');
  });

  it('refuses to choose when two candidates both qualify', () => {
    // Ambiguity is where guessing costs most: two similarly-named entities
    // are exactly the pair a human would need to look at.
    const chosen = chooseMerchant('Bunnings Warehouse', [
      entity('e1', 'Bunnings'),
      entity('e2', 'Bunnings Warehouse'),
    ]);
    expect(chosen).toBeNull();
  });

  it('answers nothing when nothing matches', () => {
    expect(chooseMerchant('Bunnings Warehouse', [entity('e1', 'Coles')])).toBeNull();
    expect(chooseMerchant('Bunnings Warehouse', [])).toBeNull();
  });

  it('resolves a merchant reachable only by an alias', () => {
    // POPS-2700 widened contacts to match aliases; nothing here matches on
    // name, so a fix that still ranks on `.name` alone answers null.
    const chosen = chooseMerchant('Maccas', [
      entity('e1', 'Coles'),
      entity('e2', "McDonald's", ['Maccas']),
    ]);
    expect(chosen).toBe('e2');
  });

  it('lets a name match outrank an alias-only match', () => {
    // Two candidates both qualify, but not in the same tier: e1 matches
    // by name, e2 only by alias. The name match wins outright rather than
    // the pair reading as an ambiguity that resolves to no match.
    const chosen = chooseMerchant('Maccas', [
      entity('e1', 'Maccas'),
      entity('e2', "McDonald's", ['Maccas']),
    ]);
    expect(chosen).toBe('e1');
  });

  it('still refuses to choose when two candidates tie within the winning tier', () => {
    const chosen = chooseMerchant('Maccas', [
      entity('e1', 'Maccas Drive Thru'),
      entity('e2', 'Maccas Express'),
    ]);
    expect(chosen).toBeNull();

    const aliasTie = chooseMerchant('Maccas', [
      entity('e1', "McDonald's", ['Maccas']),
      entity('e2', 'Golden Arches Co', ['Maccas']),
    ]);
    expect(aliasTie).toBeNull();
  });
});

describe('the live resolver', () => {
  it('resolves an unambiguous merchant to its entity id', async () => {
    const resolver = createMerchantResolver(
      handleReturning({ data: [entity('e1', 'Coles'), entity('e2', 'Bunnings')] })
    );
    await expect(resolver.resolve('Bunnings Warehouse')).resolves.toBe('e2');
  });

  it('requests only merchants and ignores same-name persons in responses', async () => {
    const list = vi.fn(
      async () =>
        ({
          kind: 'ok',
          value: {
            data: [entity('person', 'Bunnings', [], 'person'), entity('merchant', 'Bunnings')],
          },
        }) satisfies CallResult<unknown>
    );
    const resolver = createMerchantResolver(handleWithList(list));
    await expect(resolver.resolve('Bunnings')).resolves.toBe('merchant');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ excludePersons: true }));
    expect(chooseMerchant('Bunnings', [entity('person', 'Bunnings', [], 'person')])).toBeNull();
  });

  it('answers nothing rather than failing when contacts is unreachable', async () => {
    // A pillar that is down must not stop a receipt being read. The
    // purchase is real and the merchant name off the paper is still kept.
    const resolver = createMerchantResolver(handleFailing());
    await expect(resolver.resolve('Bunnings Warehouse')).resolves.toBeNull();
  });

  it('answers nothing when the call throws outright', async () => {
    const throwing = handleWithList(() => Promise.reject(new Error('socket hang up')));
    await expect(createMerchantResolver(throwing).resolve('Bunnings')).resolves.toBeNull();
  });

  it('answers nothing when contacts returns a shape it cannot read', async () => {
    const resolver = createMerchantResolver(handleReturning({ entities: ['nope'] }));
    await expect(resolver.resolve('Bunnings')).resolves.toBeNull();
  });

  it('does not call contacts at all for a name with nothing to search on', async () => {
    let called = false;
    const spy = handleWithList(async () => {
      called = true;
      return { kind: 'ok', value: { data: [] } };
    });

    await expect(createMerchantResolver(spy).resolve('Pty Ltd')).resolves.toBeNull();
    expect(called).toBe(false);
  });
});
