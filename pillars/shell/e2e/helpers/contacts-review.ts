import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { ManifestPayloadSchema, RegistrySnapshotPayloadSchema } from '@pops/pillar-sdk';

import { fulfilWith, stubShellBoot } from './pillar-rest';

import type { Page } from '@playwright/test';

const RowSchema = z.object({
  rowId: z.string(),
  proposalRevision: z.string(),
  incoming: z.object({ displayName: z.string(), name: z.object({}), points: z.array(z.never()) }),
  entityId: z.null(),
  ownerEntityId: z.null(),
  sourceRecordId: z.null(),
  processed: z.literal(false),
  proposal: z.literal('new_source'),
  errors: z.array(z.never()),
  classification: z.literal('new'),
  reason: z.literal('new_person'),
  staleSource: z.literal(false),
  decisions: z.record(z.string(), z.enum(['merged', 'different', 'later'])),
  candidateTotal: z.literal(0),
  candidateOffset: z.literal(0),
  candidateLimit: z.literal(50),
  candidatesTruncated: z.literal(false),
  candidates: z.array(z.never()),
});
const ReviewSchema = z.object({
  batchId: z.string(),
  batchRevision: z.number(),
  directoryRevision: z.number(),
  proposalRevision: z.string(),
  totalRows: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: z.object({
    automatic: z.number(),
    review: z.number(),
    new: z.number(),
    invalid: z.number(),
  }),
  ready: z.object({
    proposalRevision: z.string(),
    eligibleRows: z.number(),
    automaticMerges: z.number(),
    newPeople: z.number(),
    sourceUpdates: z.number(),
    sourceRemovals: z.number(),
    deferred: z.number(),
    reviewRequired: z.number(),
    alreadyProcessed: z.number(),
  }),
  source: z.object({
    accountId: z.string(),
    provider: z.string(),
    label: z.string(),
    active: z.boolean(),
    id: z.null(),
    ownerEntityId: z.null(),
    revision: z.null(),
    displayName: z.null(),
    name: z.object({}),
  }),
  rows: z.array(RowSchema),
});

const names = [
  'Rosane MenegottoWithAnUnbrokenLongFamilyName',
  'AlexandriaMontgomeryWithAnUnbrokenLongContactName',
  'Incoming EmailContactWithAnUnbrokenLongFamilyName',
  'Incoming PhoneContactWithAnUnbrokenLongFamilyName',
  'SamuelWithAnUnbrokenLongContactName',
  'Incoming AnotherContactWithAnUnbrokenLongFamilyName',
];
const review = ReviewSchema.parse({
  batchId: 'layout-batch',
  batchRevision: 1,
  directoryRevision: 1,
  proposalRevision: 'layout-proof',
  totalRows: names.length,
  offset: 0,
  limit: 50,
  counts: { automatic: 0, review: 0, new: names.length, invalid: 0 },
  ready: {
    proposalRevision: 'ready-proof',
    eligibleRows: names.length,
    automaticMerges: 0,
    newPeople: names.length,
    sourceUpdates: 0,
    sourceRemovals: 0,
    deferred: 0,
    reviewRequired: 0,
    alreadyProcessed: 0,
  },
  source: {
    accountId: 'fictional-account',
    provider: 'vcard',
    label: 'Fictional address book',
    active: true,
    id: null,
    ownerEntityId: null,
    revision: null,
    displayName: null,
    name: {},
  },
  rows: names.map((name, index) => ({
    rowId: `row-${index}`,
    proposalRevision: `row-proof-${index}`,
    incoming: { displayName: name, name: {}, points: [] },
    entityId: null,
    ownerEntityId: null,
    sourceRecordId: null,
    processed: false,
    proposal: 'new_source',
    errors: [],
    classification: 'new',
    reason: 'new_person',
    staleSource: false,
    decisions: {},
    candidateTotal: 0,
    candidateOffset: 0,
    candidateLimit: 50,
    candidatesTruncated: false,
    candidates: [],
  })),
});

/** Mount the actual contacts remote with a validated fictional read-only review response. */
export async function stubContactsReview(page: Page): Promise<void> {
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
            lastHeartbeatAt: '2026-10-24T00:00:00.000Z',
          },
        ],
      },
      'contacts layout registry'
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
  await page.route(
    /\/contacts-api\/imports\/layout-batch\/review-proposals(?:\?.*)?$/,
    fulfilWith(200, ReviewSchema, review, 'contacts layout review')
  );
}
