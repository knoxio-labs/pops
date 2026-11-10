import { z } from 'zod';

import { json, stubShellBoot } from './pillar-rest';

import type { Page } from '@playwright/test';

const Plan = z.object({
  id: z.number().int().positive(),
  tripId: z.number().int().positive(),
  revision: z.number().int().positive(),
  removed: z.boolean(),
  contactUri: z.string().nullable(),
  visitId: z.number().int().positive().nullable(),
  title: z.string(),
  notes: z.string(),
  intention: z.enum(['Considering', 'Planned']),
  agreement: z.enum(['Not agreed', 'Agreed']),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type MeetingPlan = z.infer<typeof Plan>;
const timestamp = '2029-01-01T00:00:00Z';
const initial: MeetingPlan = {
  id: 41,
  tripId: 7,
  revision: 1,
  removed: false,
  contactUri: 'pops:contacts/contact/historical',
  visitId: 90,
  title: 'Coffee',
  notes: '',
  intention: 'Considering',
  agreement: 'Not agreed',
  startDate: null,
  endDate: '2030-01-03',
  createdAt: timestamp,
  updatedAt: timestamp,
};

/** Fictional meeting and owner response controls for real remote/capability browser integration. */
export interface PeopleBrowserSource {
  writes: unknown[];
  creates: () => number;
  canonicalReads: () => number;
  failCreate: () => void;
}

/** Mirror meeting-plan and Contacts REST fixtures; source persistence is covered by the owning SQLite regression. */
export async function stubTripPeople(page: Page): Promise<PeopleBrowserSource> {
  await stubShellBoot(page, ['trips']);
  let source = { ...initial };
  const writes: unknown[] = [];
  await page.route(/\/trips-api\/places$/, (route) =>
    json(route, 200, {
      places: [
        { id: 52, name: 'Wellington', sourceLinks: [], createdAt: timestamp, updatedAt: timestamp },
      ],
    })
  );
  await page.route(/\/trips-api\/trips\/7$/, (route) =>
    json(route, 200, {
      id: 7,
      name: 'Source trip',
      destination: '',
      when: '',
      notes: '',
      parentId: null,
      tagId: null,
      sourceLinks: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  );
  await page.route(/\/trips-api\/trips$/, (route) => json(route, 200, { trips: [] }));
  await page.route(/\/tags-api\/tags(?:\?[^#]*)?$/, (route) => json(route, 200, { tags: [] }));
  await page.route(/\/trips-api\/trips\/7\/visits$/, (route) =>
    json(route, 200, {
      visits: [90, 2].map((id) => ({
        id,
        tripId: 7,
        placeId: 52,
        timing: {},
        notes: '',
        sourceLinks: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    })
  );
  await page.route(/\/trips-api\/trips\/7\/meeting-plans$/, (route) =>
    json(route, 200, { meetingPlans: [source] })
  );
  await page.route(/\/trips-api\/trips\/7\/meeting-plans\/operations$/, async (route) => {
    const operation = z
      .object({
        operationId: z.uuid(),
        command: z.object({
          kind: z.literal('update'),
          id: z.number(),
          expectedRevision: z.number(),
          patch: Plan.partial(),
        }),
      })
      .parse(route.request().postDataJSON());
    writes.push(operation);
    const before = source;
    source = Plan.parse({ ...source, ...operation.command.patch, revision: source.revision + 1 });
    return json(route, 200, {
      receipt: {
        operationId: operation.operationId,
        undoneOperationId: null,
        before,
        after: source,
      },
      current: source,
      replayed: false,
      undone: false,
    });
  });
  const owner = await stubPeopleContacts(page);
  return { writes, ...owner };
}

async function stubPeopleContacts(page: Page): Promise<Omit<PeopleBrowserSource, 'writes'>> {
  let creates = 0;
  let canonicalReads = 0;
  let failedCreate = false;
  const entity = {
    id: 'canonical',
    name: 'Casey Park',
    type: 'person',
    aliases: [],
    defaultTags: [],
    lastEditedTime: timestamp,
  };
  await page.route(/\/contacts-api\/entities\/(?:historical|canonical)\/reference$/, (route) =>
    json(route, 200, { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' })
  );
  await page.route(/\/contacts-api\/entities\/canonical$/, (route) => {
    canonicalReads += 1;
    return json(route, 200, { data: entity });
  });
  await page.route(/\/contacts-api\/entity-types$/, (route) =>
    json(route, 200, { types: ['person', 'company'], defaultType: 'person' })
  );
  await page.route(/\/contacts-api\/entities(?:\?[^#]*)?$/, (route) => {
    if (route.request().method() === 'POST') {
      creates += 1;
      if (failedCreate)
        return json(route, 503, {
          code: 'contacts.test.unavailable',
          message: 'Unavailable',
          retryable: true,
        });
      return json(route, 201, { data: entity, message: 'Created' });
    }
    return json(route, 200, {
      data: [],
      pagination: { hasMore: false, limit: 50, offset: 0, total: 0 },
    });
  });
  return {
    creates: () => creates,
    canonicalReads: () => canonicalReads,
    failCreate: () => {
      failedCreate = true;
    },
  };
}
