import type { PersonGateway, PersonSnapshot } from './contracts';

const snapshot: PersonSnapshot = {
  entity: {
    id: 'person',
    name: 'Marina Duarte',
    type: 'person',
    aliases: [],
    defaultTags: ['existing'],
    notes: 'Existing notes',
    lastEditedTime: '2026-11-08T00:00:00Z',
  },
  points: [
    {
      id: 'point',
      entityId: 'person',
      kind: 'email',
      value: 'Marina@Example.test',
      label: 'Studio',
      active: false,
      preferred: true,
      sourceRecordId: 'source',
      createdAt: '2026-11-08T00:00:00Z',
    },
    {
      id: 'phone',
      entityId: 'person',
      kind: 'phone',
      value: '0412 555 018',
      countryCode: null,
      active: true,
      preferred: false,
      sourceRecordId: null,
      createdAt: '2026-11-08T00:00:00Z',
    },
  ],
  addresses: [
    {
      id: 'address',
      entityId: 'person',
      value: '18 Fictional Street\nOlinda',
      lastEditedTime: '2026-11-08T00:00:00Z',
    },
  ],
  sources: [
    {
      id: 'source',
      entityId: 'person',
      accountId: 'account',
      active: false,
      collectionKey: 'book',
      recordKey: 'record',
      lastSeenAt: '2026-11-08T00:00:00Z',
      nameCompleteness: 'unknown',
      revision: 1,
    },
  ],
  accounts: [
    {
      id: 'account',
      provider: 'icloud',
      accountKey: 'fictional',
      label: 'Personal account',
      createdAt: '2026-11-08T00:00:00Z',
    },
  ],
};

/** Independent fictional records preserve raw values and explicit provenance. */
export function personSnapshot(): PersonSnapshot {
  return structuredClone(snapshot);
}

/** An explicit gateway fake whose unsupported operations fail instead of silently succeeding. */
export function personTestGateway(data = personSnapshot()): PersonGateway {
  return {
    load: async () => data,
    save: async (_id, draft) => ({ ...data.entity, ...draft }),
    addPoint: async () => {
      throw new Error('Unexpected point write');
    },
    addAddress: async () => {
      throw new Error('Unexpected address write');
    },
  };
}
