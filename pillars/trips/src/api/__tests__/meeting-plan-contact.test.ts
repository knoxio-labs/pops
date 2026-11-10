import { describe, expect, it, vi } from 'vitest';

import { resolveMeetingContact } from '../rest/meeting-plan-contact.js';

describe('Published Contacts canonical reference protocol', () => {
  it('passes the opaque historical identity to its owner and accepts the owner-issued URI verbatim', async () => {
    const read = vi.fn(async () => ({
      kind: 'ok' as const,
      value: { canonicalId: 'retained', uri: 'pops:contacts/contact/retained' },
    }));
    expect(await resolveMeetingContact('pops:contacts/contact/historical', read)).toBe(
      'pops:contacts/contact/retained'
    );
    expect(read).toHaveBeenCalledExactlyOnceWith('historical');
  });
  it('distinguishes unknown identities from unavailable/invalid owning responses', async () => {
    expect(
      await resolveMeetingContact('pops:contacts/contact/a', async () => ({
        kind: 'not-found',
        pillar: 'contacts',
      }))
    ).toBeNull();
    expect(
      await resolveMeetingContact('pops:contacts/contact/a', async () => ({
        kind: 'unavailable',
        pillar: 'contacts',
      }))
    ).toBeUndefined();
    expect(
      await resolveMeetingContact('pops:contacts/contact/a', async () => {
        throw new Error('Network unavailable');
      })
    ).toBeUndefined();
    for (const value of [
      { uri: 'pops:contacts/contact/a' },
      { canonicalId: 'a', uri: 'pops:finance/contact/a' },
      { canonicalId: 'a', uri: '' },
    ])
      expect(
        await resolveMeetingContact('pops:contacts/contact/a', async () => ({ kind: 'ok', value }))
      ).toBeUndefined();
  });
  it('rejects an invalid reference namespace before calling Contacts', async () => {
    const read = vi.fn();
    await expect(resolveMeetingContact('pops:contacts/person/a', read)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
