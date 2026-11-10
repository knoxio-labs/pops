import { z } from 'zod';

import { json } from './pillar-rest';

import type { Page, Route } from '@playwright/test';

const workspaceUrl = /\/trips-api\/trips\/71\/capture-workspace$/;
const placesUrl = /\/trips-api\/places$/;
const visitsUrl = /\/trips-api\/trips\/71\/visits$/;
const entityTypesUrl = /\/contacts-api\/entity-types$/;
const entitiesUrl = /\/contacts-api\/entities(?:\/[^/?]+)?(?:\?.*)?$/;
const entityReferenceUrl = /\/contacts-api\/entities\/[^/]+\/reference$/;
const taskId = /^[A-Za-z0-9_-]{1,72}$/u;

const sourceWorkspaceSchema = z
  .strictObject({
    captures: z.array(
      z.strictObject({
        id: z.number().int().positive(),
        tripId: z.number().int().positive(),
        originalText: z.string(),
        originalUrl: z.string().nullable(),
        attachments: z.array(
          z.discriminatedUnion('kind', [
            z.strictObject({ kind: z.literal('task'), taskId: z.string().regex(taskId) }),
            z.strictObject({
              kind: z.literal('document'),
              documentId: z.number().int().positive(),
              taskId: z.string().regex(taskId).optional(),
            }),
          ])
        ),
        classification: z.enum(['idea', 'note', 'event', 'link', 'document']).nullable(),
        notes: z.string(),
        placeId: z.number().int().positive().nullable(),
        visitId: z.number().int().positive().nullable(),
        revision: z.number().int().positive(),
        removedAt: z.iso.datetime().nullable(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      })
    ),
    ideas: z.array(z.never()),
    associations: z.array(z.never()),
    memberships: z.array(z.never()),
    events: z.array(z.never()),
    journeys: z.array(z.never()),
    stays: z.array(z.never()),
  })
  .meta({ id: 'CaptureWorkspaceFixture' });

/** Mirrors the published Trips SourceWorkspace wire shape without importing the producer contract. */
export const captureWorkspace = {
  captures: [
    {
      id: 701,
      tripId: 71,
      revision: 1,
      originalText: 'Original booking note — preserve exactly.',
      originalUrl: null,
      classification: null,
      notes: '',
      placeId: null,
      visitId: null,
      attachments: [{ kind: 'task', taskId: '202' }],
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
      removedAt: null,
    },
  ],
  ideas: [],
  associations: [],
  memberships: [],
  events: [],
  journeys: [],
  stays: [],
};

/** Validate and install focused owner fixtures while keeping Contacts' bundled chooser real. */
export async function stubCaptureWorkspace(page: Page): Promise<void> {
  const source = sourceWorkspaceSchema.parse(captureWorkspace);
  await page.route(workspaceUrl, (route) => json(route, 200, source));
  await page.route(placesUrl, (route) => json(route, 200, { places: [] }));
  await page.route(visitsUrl, (route) => json(route, 200, { visits: [] }));
  await page.route(/\/trips-api\/trips\/71\/(?:events|stays|journeys)$/, (route) =>
    json(route, 200, {
      [new URL(route.request().url()).pathname.split('/').at(-1) ?? 'events']: [],
    })
  );
  await page.route(/\/documents-api\/paperless\/tasks\/202$/, (route) =>
    json(route, 200, { data: { state: 'pending', documentId: null, reason: null } })
  );
  await page.route(entityTypesUrl, (route) =>
    json(route, 200, {
      types: ['person', 'company', 'organisation', 'government', 'bank', 'place', 'brand'],
      defaultType: 'company',
    })
  );
  let created = 0;
  await page.route(entitiesUrl, async (route: Route) => {
    if (route.request().method() === 'GET' && /\/entities\/[^/?]+$/.test(route.request().url())) {
      const id = new URL(route.request().url()).pathname.split('/').at(-1) ?? 'contact-1';
      await json(route, 200, { data: contactEntity(id) });
      return;
    }
    if (route.request().method() !== 'POST') {
      await json(route, 200, {
        data: [],
        pagination: { hasMore: false, limit: 20, offset: 0, total: 0 },
      });
      return;
    }
    created += 1;
    await json(route, 201, {
      data: contactEntity(`contact-${String(created)}`),
      message: 'Contact created',
    });
  });
  await page.route(entityReferenceUrl, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2) ?? 'contact-1';
    return json(route, 200, { canonicalId: id, uri: `pops:contacts/contact/${id}` });
  });
  await page.route(/\/documents-api\/paperless\/status$/, (route) =>
    json(route, 200, {
      data: {
        configured: true,
        available: true,
        baseUrl: 'https://paperless.example',
        documentCount: 4,
        maxUploadBytes: 1000,
        allowedMimeTypes: ['text/plain'],
      },
    })
  );
  await page.route(/\/documents-api\/paperless\/tasks\/capture-upload-[12]$/, (route) =>
    json(route, 200, { data: { state: 'pending', documentId: null, reason: null } })
  );
}

function contactEntity(id: string) {
  return {
    id,
    name: 'Harbour Guide',
    type: 'company',
    aliases: [],
    defaultTags: [],
    lastEditedTime: '2026-11-10T00:00:00.000Z',
  };
}
