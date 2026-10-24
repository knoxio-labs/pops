import { describe, expect, it } from 'vitest';

import {
  acceptEntityLabel,
  resolveEntityExistence,
  resolveSuggestedMerchant,
} from './entity-existence';

const ENTITIES = [{ name: 'Cloudflare' }, { name: 'Evie Networks' }];

const WITH_ALIASES = [
  { name: "McDonald's", aliases: ['Maccas', 'Golden Arches'] },
  { name: 'Coles', aliases: [] },
];

describe('resolveEntityExistence', () => {
  it('matches an existing entity regardless of case', () => {
    expect(resolveEntityExistence('cloudFLARE', ENTITIES, 'ready')).toBe('existing');
  });

  it('reports a name absent from a complete list as new', () => {
    expect(resolveEntityExistence('Chargefox', ENTITIES, 'ready')).toBe('new');
  });

  it('refuses to call an absent name new while the list is still loading', () => {
    expect(resolveEntityExistence('Chargefox', undefined, 'checking')).toBe('checking');
    expect(resolveEntityExistence('Cloudflare', undefined, 'checking')).toBe('checking');
  });

  it('treats an empty loaded list as complete — every name is new', () => {
    expect(resolveEntityExistence('Chargefox', [], 'ready')).toBe('new');
  });

  it('treats an alias as the entity, so accepting one does not mint a duplicate', () => {
    expect(resolveEntityExistence('Maccas', WITH_ALIASES, 'ready')).toBe('existing');
    expect(resolveEntityExistence('golden arches', WITH_ALIASES, 'ready')).toBe('existing');
  });

  it('still calls a genuinely unknown name new when others carry aliases', () => {
    expect(resolveEntityExistence('Hungry Jacks', WITH_ALIASES, 'ready')).toBe('new');
  });

  it('tolerates an entity with no aliases field at all', () => {
    expect(resolveEntityExistence('Cloudflare', ENTITIES, 'ready')).toBe('existing');
    expect(resolveEntityExistence('Nope', ENTITIES, 'ready')).toBe('new');
  });

  it('is unknown when there is no name to classify', () => {
    expect(resolveEntityExistence(undefined, ENTITIES, 'ready')).toBe('unavailable');
    expect(resolveEntityExistence('', ENTITIES, 'ready')).toBe('unavailable');
  });

  it('reports an unavailable contact list separately from a list still loading', () => {
    expect(resolveEntityExistence('Chargefox', undefined, 'unavailable')).toBe('unavailable');
  });
});

describe('acceptEntityLabel', () => {
  it('says assign for an entity that already exists', () => {
    expect(acceptEntityLabel('existing', 'one', 'Cloudflare')).toBe('Assign to "Cloudflare"');
    expect(acceptEntityLabel('existing', 'all', 'Cloudflare')).toBe('Assign all to "Cloudflare"');
  });

  it('says create for an entity that does not exist yet', () => {
    expect(acceptEntityLabel('new', 'one', 'Chargefox')).toBe('Create "Chargefox"');
    expect(acceptEntityLabel('new', 'all', 'Chargefox')).toBe('Create "Chargefox" & assign all');
  });

  it('does not promise an outcome while Contacts is checking', () => {
    const one = acceptEntityLabel('checking', 'one', 'Chargefox');
    const all = acceptEntityLabel('checking', 'all', 'Chargefox');
    for (const label of [one, all]) {
      expect(label).not.toMatch(/create/i);
      expect(label).not.toMatch(/assign/i);
    }
    expect(one).toBe('Checking "Chargefox"…');
    expect(all).toBe('Checking "Chargefox"…');
  });
});

describe('resolveSuggestedMerchant', () => {
  it('retains people in the picker but excludes them from AI merchant resolution', () => {
    const entities = [
      { id: 'person', name: 'Alex Smith', type: 'person' },
      { id: 'merchant', name: 'Alex Smith', type: 'company' },
    ];
    expect(resolveSuggestedMerchant(entities, 'Alex Smith')?.id).toBe('merchant');
    expect(resolveSuggestedMerchant(entities.slice(0, 1), 'Alex Smith')).toBeUndefined();
    expect(resolveEntityExistence('Alex Smith', entities.slice(0, 1), 'ready')).toBe('new');
  });

  it('rejects ambiguous merchant names and aliases', () => {
    const entities = [
      { id: 'one', name: 'Acme', type: 'company', aliases: ['Shared'] },
      { id: 'two', name: 'ACME', type: 'bank', aliases: ['Shared'] },
    ];
    expect(() => resolveSuggestedMerchant(entities, 'Acme')).toThrow('Multiple contacts');
    expect(() => resolveSuggestedMerchant(entities, 'Shared')).toThrow('Multiple contacts');
    expect(resolveEntityExistence('Acme', entities, 'ready')).toBe('unavailable');
  });
});
