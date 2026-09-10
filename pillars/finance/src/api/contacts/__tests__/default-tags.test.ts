/**
 * What may reach a contact's `defaultTags`.
 *
 * Nothing validated this. Fifteen contacts carried `venue:bar` — a value the
 * vocabulary has never held and that no transaction has ever carried — as
 * their only default, and the tag-suggester's entity pass re-proposed it on
 * every import of those merchants, where it was stripped by hand every time.
 * The ledger for the same fifteen said `venue:pub` on 37 of 38 rows
 * (POPS-3293).
 *
 * That is the shape of the defect: a `defaultTags` value is not a one-off
 * mistake, it is a wrong suggestion that returns forever. So the assertions
 * here are about what does NOT reach the wire.
 */
import { describe, expect, it, vi } from 'vitest';

import { createKnownTagSet } from '../../../db/services/tag-vocabulary.js';
import { createContactsClient } from '../client.js';
import {
  assertKnownDefaultTags,
  UnknownDefaultTagError,
  unknownDefaultTags,
} from '../default-tags.js';
import { stubHandle, unexpected } from './stub-handle.js';

const KNOWN = createKnownTagSet(['venue:pub', 'venue:cafe', 'occasion:health', 'contains:coffee']);

describe('unknownDefaultTags', () => {
  it('names the value the vocabulary does not hold, and only that one', () => {
    expect(unknownDefaultTags(['venue:pub', 'venue:bar'], KNOWN)).toEqual(['venue:bar']);
  });

  it('is not about `venue:` — the hole admitted any unknown tag, in any facet', () => {
    // The ticket's last acceptance criterion. `defaultTags` only ever holds
    // `venue:` today, so a check written around that facet would pass every
    // test anyone thought to write and still admit the next one.
    expect(unknownDefaultTags(['occasion:invented'], KNOWN)).toEqual(['occasion:invented']);
    expect(unknownDefaultTags(['enrich:zip'], KNOWN)).toEqual(['enrich:zip']);
    expect(unknownDefaultTags(['person:nobody'], KNOWN)).toEqual(['person:nobody']);
  });

  it('compares the way the vocabulary itself does, so case is not what decides it', () => {
    expect(unknownDefaultTags(['VENUE:PUB', ' venue:cafe '], KNOWN)).toEqual([]);
  });

  it('counts a blank entry as unknown rather than skipping it', () => {
    // An empty tag is not a tag. Admitting one would put a value on a contact
    // that no reader can act on and no vocabulary can explain.
    expect(unknownDefaultTags(['', '   '], KNOWN)).toEqual(['', '   ']);
  });

  it('says nothing about an empty list, which is how a default is cleared', () => {
    expect(unknownDefaultTags([], KNOWN)).toEqual([]);
  });
});

describe('assertKnownDefaultTags', () => {
  it('names the entity and every offending value, for whoever fixes the override file', () => {
    expect(() => assertKnownDefaultTags('e1', ['venue:bar', 'venue:club'], KNOWN)).toThrow(
      /venue:bar, venue:club/
    );
  });

  it('throws its own type, because this one never succeeds on retry', () => {
    // Distinguishable from an outage: the fix is to the input, not to the peer.
    expect(() => assertKnownDefaultTags('e1', ['venue:bar'], KNOWN)).toThrow(
      UnknownDefaultTagError
    );
  });

  it('lets a fully-known list through', () => {
    expect(() => assertKnownDefaultTags('e1', ['venue:pub'], KNOWN)).not.toThrow();
  });
});

describe('the client refuses before the wire', () => {
  function clientSpying() {
    const update = vi.fn(async () => unexpected('update should never be reached'));
    const list = () => unexpected('entities.list');
    return { client: createContactsClient(() => stubHandle({ list, update })), update };
  }

  it('does not send a patch naming a value the vocabulary does not hold', async () => {
    const { client, update } = clientSpying();

    await expect(client.updateDefaultTags('e1', ['venue:bar'], KNOWN)).rejects.toThrow(
      UnknownDefaultTagError
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses the WHOLE write, not the subset that passed', async () => {
    // A `defaultTags` patch replaces the list, so sending the known half would
    // silently drop a reviewed human call and report success having lost it.
    const { client, update } = clientSpying();

    await expect(client.updateDefaultTags('e1', ['venue:pub', 'venue:bar'], KNOWN)).rejects.toThrow(
      UnknownDefaultTagError
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses even where no credential is held, since the value is wrong either way', async () => {
    // Ahead of the credential check on purpose: finding out only on a machine
    // that happens to hold a key is how the fifteen survived.
    const client = createContactsClient(() => null);

    await expect(client.updateDefaultTags('e1', ['venue:bar'], KNOWN)).rejects.toThrow(
      UnknownDefaultTagError
    );
  });
});
