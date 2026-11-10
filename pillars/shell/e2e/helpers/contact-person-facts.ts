import { readFileSync } from 'node:fs';

import { expect } from '@playwright/test';

import { contractResponseConformance } from '@pops/pillar-sdk/testing/api-mock';

import { json } from './pillar-rest';

import type { Page } from '@playwright/test';

const entity = {
  id: 'person-facts',
  name: 'Marina Duarte',
  type: 'person',
  aliases: [],
  defaultTags: [],
  notes: 'Original notes',
  lastEditedTime: '2026-11-10T00:00:00Z',
};
const point = {
  id: 'source-point',
  entityId: entity.id,
  kind: 'email',
  value: 'Marina@Example.test',
  label: 'Studio',
  countryCode: null,
  sourceRecordId: 'source',
  active: true,
  preferred: true,
  createdAt: '2026-11-10T00:00:00Z',
};
const address = {
  id: 'address',
  entityId: entity.id,
  value: '18 Fictional Street\nOlinda',
  label: 'Home',
  city: '',
  lastEditedTime: '2026-11-10T00:00:00Z',
};
const original = { version: 1, entity, points: [point], addresses: [address], operations: [] };
const edited = {
  version: 2,
  entity,
  points: [
    {
      ...point,
      id: 'local-point',
      kind: 'other',
      value: 'opaque @custom :text',
      sourceRecordId: null,
    },
  ],
  addresses: [{ ...address, city: 'Unlisted literal city' }],
  operations: [{ id: 'operation', createdAt: '2026-11-10T00:01:00Z', canUndo: true }],
};
const saved = { data: edited, operation: { id: 'operation', undoneOperationId: null } };
const undone = {
  data: { ...original, version: 3 },
  operation: { id: 'undo', undoneOperationId: 'operation' },
};

/** Exercise the real person remote with contract-checked snapshots and explicit atomic save/undo boundaries. */
export async function stubPersonFacts(page: Page): Promise<void> {
  const spec: unknown = JSON.parse(
    readFileSync(
      new URL('../../../contacts/openapi/contacts.openapi.json', import.meta.url),
      'utf8'
    )
  );
  const conformance = await contractResponseConformance(spec, {
    'GET /entities/{id}/facts': () => ({ body: { data: original } }),
    'POST /entities/{id}/facts/changes': () => ({ body: saved }),
    'POST /entities/{id}/facts/changes/{operation_id}/undo': () => ({ body: undone }),
  });
  expect(conformance).toHaveLength(3);
  for (const response of conformance) expect(response.issues).toEqual([]);
  await page.route(/\/contacts-api\/entities\/person-facts\/facts$/, (route) =>
    json(route, 200, { data: original })
  );
  await page.route(/\/contacts-api\/entities\/person-facts\/sources$/, (route) =>
    json(route, 200, {
      data: [
        {
          id: 'source',
          entityId: entity.id,
          accountId: 'account',
          collectionKey: 'book',
          recordKey: 'record',
          active: true,
          revision: 1,
          lastSeenAt: '2026-11-10T00:00:00Z',
          nameCompleteness: 'unknown',
        },
      ],
    })
  );
  await page.route(/\/contacts-api\/sources\/accounts$/, (route) =>
    json(route, 200, {
      data: [
        {
          id: 'account',
          provider: 'vcard',
          accountKey: 'fictional',
          label: 'Fictional source',
          createdAt: '2026-11-10T00:00:00Z',
        },
      ],
    })
  );
  await page.route(/\/contacts-api\/entities\/person-facts\/facts\/changes$/, (route) => {
    const body: unknown = route.request().postDataJSON();
    expect(body).toMatchObject({
      expectedVersion: 1,
      changes: [
        {
          action: 'editPoint',
          pointId: 'source-point',
          point: { kind: 'other', value: 'opaque @custom :text' },
        },
        { action: 'editAddress', addressId: 'address', address: { city: 'Unlisted literal city' } },
      ],
    });
    return json(route, 200, saved);
  });
  await page.route(
    /\/contacts-api\/entities\/person-facts\/facts\/changes\/operation\/undo$/,
    (route) => {
      const body: unknown = route.request().postDataJSON();
      expect(body).toMatchObject({ expectedVersion: 2 });
      return json(route, 200, undone);
    }
  );
}
