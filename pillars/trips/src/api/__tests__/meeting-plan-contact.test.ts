import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { meetingFixture } from '../../db/__tests__/meeting-plan-fixture.js';
import { meetingPlanOperations } from '../../db/schema.js';
import { listMeetingPlans } from '../../db/services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../../db/services/meeting-plans.js';
import { prepareMeetingContact, resolveMeetingContact } from '../rest/meeting-plan-contact.js';

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
      { canonicalId: 'owner-a', uri: 'pops:contacts/contact/owner-b' },
      { canonicalId: 'owner?query', uri: 'pops:contacts/contact/owner?query' },
      { canonicalId: 'owner#fragment', uri: 'pops:contacts/contact/owner#fragment' },
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
  it('rejects inconsistent owner proof before writing a meeting source or operation receipt', async () => {
    const fixture = meetingFixture();
    try {
      const operation = {
        operationId: randomUUID(),
        command: {
          kind: 'create',
          input: { contactUri: 'pops:contacts/contact/requested' },
        },
      } as const;
      const read = vi.fn(async () => ({
        kind: 'ok' as const,
        value: { canonicalId: 'owner-a', uri: 'pops:contacts/contact/owner-b' },
      }));
      const run = async () => {
        const canonical = await prepareMeetingContact(
          fixture.db,
          fixture.trip.id,
          operation,
          (uri) => resolveMeetingContact(uri, read)
        );
        return operateMeetingPlan(fixture.db, fixture.trip.id, operation, canonical);
      };
      await expect(run()).rejects.toThrow('meeting_contact_unavailable');
      expect(read).toHaveBeenCalledExactlyOnceWith('requested');
      expect(listMeetingPlans(fixture.db, fixture.trip.id)).toEqual([]);
      expect(fixture.db.select().from(meetingPlanOperations).all()).toEqual([]);
    } finally {
      fixture.opened.raw.close();
    }
  });
});
