import { describe, expect, it, vi } from 'vitest';

import { resolveContactReference } from '../rest/contact-reference.js';

import type { CallResult } from '@pops/pillar-sdk/server';

const alias = 'pops:contacts/contact/retired+opaque%2Fidentity';
const canonicalId = 'canonical+opaque%2Fidentity';
const uri = 'pops:contacts/contact/canonical+opaque%2Fidentity';

describe('Contacts owner-reference boundary', () => {
  it('requests the exact opaque identity and preserves the owner-issued canonical redirect', async () => {
    const read = vi.fn(async (): Promise<CallResult<unknown>> => ({
      kind: 'ok',
      value: { canonicalId, uri },
    }));
    expect(await resolveContactReference(alias, read)).toBe(uri);
    expect(read).toHaveBeenCalledExactlyOnceWith('retired+opaque%2Fidentity');
  });

  it.each([
    {},
    { canonicalId },
    { uri },
    { canonicalId, uri: alias },
    { canonicalId, uri: 'https://example.test/person' },
    { canonicalId, uri: 'pops:documents/document/4' },
  ])('rejects malformed or internally contradictory owner responses %j', async (value) => {
    expect(
      await resolveContactReference(alias, async () => ({ kind: 'ok', value }))
    ).toBeUndefined();
  });

  it('distinguishes an unknown identity from an unavailable or refused owner read', async () => {
    expect(
      await resolveContactReference(alias, async () => ({ kind: 'not-found', pillar: 'contacts' }))
    ).toBeNull();
    expect(
      await resolveContactReference(alias, async () => ({
        kind: 'unavailable',
        pillar: 'contacts',
      }))
    ).toBeUndefined();
    expect(
      await resolveContactReference(alias, async () => ({
        kind: 'unauthorized',
        pillar: 'contacts',
      }))
    ).toBeUndefined();
    expect(
      await resolveContactReference(alias, async () => {
        throw new Error('Owner unavailable');
      })
    ).toBeUndefined();
  });

  it('does not request non-Contact identities', async () => {
    const read = vi.fn(async (): Promise<CallResult<unknown>> => ({
      kind: 'ok',
      value: { canonicalId, uri },
    }));
    expect(await resolveContactReference('pops:documents/document/4', read)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
});
