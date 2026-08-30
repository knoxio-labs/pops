import { describe, expect, it } from 'vitest';

import { acceptEntityLabel, resolveEntityExistence } from './entity-existence';

const ENTITIES = [{ name: 'Cloudflare' }, { name: 'Evie Networks' }];

describe('resolveEntityExistence', () => {
  it('matches an existing entity regardless of case', () => {
    expect(resolveEntityExistence('cloudFLARE', ENTITIES)).toBe('existing');
  });

  it('reports a name absent from a complete list as new', () => {
    expect(resolveEntityExistence('Chargefox', ENTITIES)).toBe('new');
  });

  it('refuses to call an absent name new when the list is truncated', () => {
    expect(resolveEntityExistence('Chargefox', ENTITIES, true)).toBe('unknown');
  });

  it('still reports a hit as existing when the list is truncated', () => {
    expect(resolveEntityExistence('Cloudflare', ENTITIES, true)).toBe('existing');
  });

  it('is unknown while the list is still loading', () => {
    expect(resolveEntityExistence('Cloudflare', undefined)).toBe('unknown');
  });

  it('is unknown when there is no name to classify', () => {
    expect(resolveEntityExistence(undefined, ENTITIES)).toBe('unknown');
    expect(resolveEntityExistence('', ENTITIES)).toBe('unknown');
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

  it('promises neither outcome when existence is unknown', () => {
    const one = acceptEntityLabel('unknown', 'one', 'Chargefox');
    const all = acceptEntityLabel('unknown', 'all', 'Chargefox');
    for (const label of [one, all]) {
      expect(label).not.toMatch(/create/i);
      expect(label).not.toMatch(/assign/i);
    }
    expect(one).toBe('Accept "Chargefox"');
    expect(all).toBe('Accept all as "Chargefox"');
  });
});
