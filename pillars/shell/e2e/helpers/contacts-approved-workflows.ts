import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { ManifestPayloadSchema, RegistrySnapshotPayloadSchema } from '@pops/pillar-sdk';

import { fulfilWith, json, stubShellBoot } from './pillar-rest';

import type { Page } from '@playwright/test';

const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  aliases: z.array(z.string()),
  defaultTags: z.array(z.string()),
  lastEditedTime: z.string(),
  notes: z.string().nullable().optional(),
});
const EntityResponseSchema = z.object({ data: EntitySchema });
const EntityListSchema = z.object({
  data: z.array(EntitySchema),
  pagination: z.object({
    hasMore: z.boolean(),
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});
const PointSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  kind: z.string(),
  value: z.string(),
  preferred: z.boolean(),
  active: z.boolean(),
  createdAt: z.string(),
  label: z.string().nullable().optional(),
  normalizedValue: z.string().nullable().optional(),
  sourceRecordId: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
});
const PointListSchema = z.object({ data: z.array(PointSchema) });
const AddressListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      entityId: z.string(),
      value: z.string(),
      lastEditedTime: z.string(),
    })
  ),
});
const SourceSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  accountId: z.string(),
  recordKey: z.string(),
  collectionKey: z.string(),
  active: z.boolean(),
  revision: z.number(),
  lastSeenAt: z.string(),
  displayName: z.string().nullable().optional(),
  nameCompleteness: z.string(),
});
const SourceListSchema = z.object({ data: z.array(SourceSchema) });
const AccountListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      accountKey: z.string(),
      provider: z.string(),
      label: z.string().nullable().optional(),
      createdAt: z.string(),
    })
  ),
});

const company = EntitySchema.parse({
  id: 'company-1',
  name: 'Harbour Books',
  type: 'company',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
});
const org = EntitySchema.parse({
  id: 'org-1',
  name: 'Southern Reading Group',
  type: 'organisation',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
});
const personA = EntitySchema.parse({
  id: 'person-a',
  name: 'Mina Patel',
  type: 'person',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
});
const personB = EntitySchema.parse({
  id: 'person-b',
  name: 'Mina P. Patel',
  type: 'person',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
});
const localPoint = PointSchema.parse({
  id: 'point-1',
  entityId: company.id,
  kind: 'email',
  value: 'hello@harbour.example',
  preferred: false,
  active: true,
  createdAt: '2026-11-10T00:00:00Z',
  label: 'General',
});
const source = SourceSchema.parse({
  id: 'source-1',
  entityId: personA.id,
  accountId: 'account-1',
  recordKey: 'mina-1',
  collectionKey: 'address-book',
  active: true,
  revision: 1,
  lastSeenAt: '2026-11-10T00:00:00Z',
  displayName: 'Mina P. Patel',
  nameCompleteness: 'complete',
});
const account = {
  id: 'account-1',
  accountKey: 'fictional-vcard',
  provider: 'vcard',
  label: 'Fictional address book',
  createdAt: '2026-11-10T00:00:00Z',
};

/** Load the built Contacts remote through the shell registry and answer its REST requests with contract-shaped fixtures. */
export async function stubContactsApprovedWorkflows(page: Page): Promise<void> {
  await stubShellBoot(page, ['contacts']);
  const manifest = ManifestPayloadSchema.parse(
    JSON.parse(
      readFileSync(
        new URL('../../../contacts/tests/fixtures/manifest.json', import.meta.url),
        'utf8'
      )
    )
  );
  await page.route(
    /\/registry-api\/registry\/pillars$/,
    fulfilWith(
      200,
      RegistrySnapshotPayloadSchema,
      {
        pillars: [
          {
            pillarId: 'contacts',
            baseUrl: 'http://contacts-api:3010',
            manifest,
            capabilities: {},
            lastHeartbeatAt: '2026-11-10T00:00:00.000Z',
          },
        ],
      },
      'contacts approved workflows registry'
    )
  );
  await page.route(/\/contacts-api\/ui\/[a-zA-Z0-9_-]+\.(?:js|css)(?:\?.*)?$/, (route) => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!file) throw new Error('Missing contacts asset filename');
    return route.fulfill({
      path: fileURLToPath(new URL(`../../../contacts/app/dist/remote/${file}`, import.meta.url)),
      contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript',
    });
  });
}

/** Stub the entity read surface used by company and organisation detail panels. */
export async function stubCompanyDetail(page: Page): Promise<void> {
  await page.route(
    /\/contacts-api\/entities\/org-1$/,
    fulfilWith(200, EntityResponseSchema, { data: org }, 'organisation detail')
  );
  await page.route(/\/contacts-api\/entities\/org-1\/contact-points$/, async (route) => {
    if (route.request().method() === 'POST') {
      return json(route, 201, {
        data: PointSchema.parse({
          id: 'point-2',
          entityId: org.id,
          kind: 'phone',
          value: '+61 2 5550 0100',
          preferred: false,
          active: true,
          createdAt: '2026-11-10T00:00:00Z',
          label: 'Reception',
        }),
      });
    }
    return json(route, 200, PointListSchema.parse({ data: [localPoint] }));
  });
  await page.route(
    /\/contacts-api\/entities\/org-1\/addresses$/,
    fulfilWith(
      200,
      AddressListSchema,
      {
        data: [
          {
            id: 'address-1',
            entityId: org.id,
            value: '8 Fiction Lane\nSydney NSW',
            lastEditedTime: '2026-11-10T00:00:00Z',
          },
        ],
      },
      'organisation addresses'
    )
  );
}

/** Stub contact creation, entity details, and local contact-point writes for the create workflow. */
export async function stubContactCreation(page: Page): Promise<void> {
  await page.route(/\/contacts-api\/entity-types$/, (route) =>
    json(route, 200, {
      types: ['company', 'person', 'government', 'bank', 'place', 'brand', 'organisation'],
      defaultType: 'company',
    })
  );
  let created: z.infer<typeof EntitySchema> | null = null;
  await page.route(/\/contacts-api\/entities$/, async (route) => {
    if (route.request().method() === 'POST') {
      created = EntitySchema.parse({
        id: 'created-company',
        name: 'Northwind Archive',
        type: 'company',
        aliases: [],
        defaultTags: [],
        lastEditedTime: '2026-11-10T00:00:00Z',
      });
      return json(route, 201, { data: created, message: 'Created' });
    }
    return json(
      route,
      200,
      EntityListSchema.parse({
        data: [],
        pagination: { hasMore: false, limit: 50, offset: 0, total: 0 },
      })
    );
  });
  await page.route(/\/contacts-api\/entities\/created-company$/, async (route) =>
    json(route, 200, EntityResponseSchema.parse({ data: created ?? company }))
  );
  await page.route(/\/contacts-api\/entities\/created-company\/contact-points$/, async (route) => {
    if (route.request().method() === 'POST')
      return json(route, 201, {
        data: PointSchema.parse({
          id: 'created-point',
          entityId: 'created-company',
          kind: 'phone',
          value: '+61 2 5550 0100',
          preferred: false,
          active: true,
          createdAt: '2026-11-10T00:00:00Z',
          label: 'Reception',
        }),
      });
    return json(route, 200, { data: [] });
  });
  await page.route(/\/contacts-api\/entities\/created-company\/addresses$/, async (route) =>
    json(route, 200, { data: [] })
  );
}

/** Stub source evidence, entity lookup and explicit resolution for duplicate review and picker selection. */
export async function stubDuplicateReview(page: Page): Promise<void> {
  await page.route(/\/contacts-api\/entities\?[^#]*$/, async (route) => {
    const query = new URL(route.request().url()).searchParams.get('search')?.toLowerCase() ?? '';
    const results = [personA, personB].filter((item) => item.name.toLowerCase().includes(query));
    return json(
      route,
      200,
      EntityListSchema.parse({
        data: results,
        pagination: { hasMore: false, limit: 50, offset: 0, total: results.length },
      })
    );
  });
  await page.route(/\/contacts-api\/entities\/person-[ab]$/, async (route) => {
    const selected = route.request().url().endsWith('person-a') ? personA : personB;
    return json(route, 200, EntityResponseSchema.parse({ data: selected }));
  });
  await page.route(/\/contacts-api\/entities\/person-[ab]\/reference$/, async (route) => {
    const id = route.request().url().endsWith('person-a/reference') ? personA.id : personB.id;
    return json(route, 200, { canonicalId: id, uri: `pops:contacts/contact/${id}` });
  });
  await page.route(
    /\/contacts-api\/entities\/person-[ab]\/contact-points$/,
    fulfilWith(200, PointListSchema, { data: [] }, 'duplicate contact points')
  );
  await page.route(/\/contacts-api\/entities\/person-[ab]\/sources$/, async (route) => {
    const data = route.request().url().endsWith('person-a/sources') ? [source] : [];
    return json(route, 200, SourceListSchema.parse({ data }));
  });
  await page.route(
    /\/contacts-api\/sources\/accounts$/,
    fulfilWith(200, AccountListSchema, { data: [account] }, 'duplicate source accounts')
  );
  await page.route(/\/contacts-api\/entities\/resolve$/, async (route) =>
    json(route, 200, {
      data: [
        { id: personB.id, canonicalId: personB.id },
        { id: personA.id, canonicalId: personA.id },
      ],
      revision: 7,
    })
  );
  await page.route(/\/contacts-api\/merges$/, async (route) =>
    json(route, 200, {
      canonicalId: personB.id,
      memberIds: [personA.id],
      operationId: 'merge-1',
      revision: 8,
    })
  );
}

export const approvedContactEntities = { company, org, personA, personB };
