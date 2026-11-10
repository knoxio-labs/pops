import { json, stubShellBoot } from './pillar-rest';
import { stubUnavailableSourceDocuments } from './trips-source-documents';

import type { Page } from '@playwright/test';

const ownerEntity = {
  id: 'owner-organiser',
  name: 'New source contact',
  type: 'organisation',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2029-01-01T00:00:00Z',
};
const ownerReference = {
  canonicalId: 'owner-organiser',
  uri: 'pops:contacts/contact/owner-organiser',
};
const audit = { createdAt: '2029-01-01T00:00:00Z', updatedAt: '2029-01-01T00:00:00Z' };
const source = {
  id: 19,
  tripId: 7,
  visitId: null,
  name: 'Source performance',
  intention: null,
  arrangement: null,
  purchase: null,
  timing: {},
  address: null,
  reference: null,
  sourceUrl: null,
  ticketUrl: null,
  notes: '',
  sourceLinks: [],
  venueLinks: [],
  organiserLinks: [],
  documentLinks: [],
  ...audit,
};
interface ContactOwnerState {
  created: () => number;
  allowReference: () => void;
  reference: typeof ownerReference;
}
/** Actual remote and owner REST seams preserve independent Contact creation and Trips source failure. */
export async function stubSourceContactOwners(page: Page, kind: 'event' | 'stay') {
  await stubShellBoot(page, ['trips']);
  await stubUnavailableSourceDocuments(page, 7);
  const writes = await stubSourceRecord(page, kind);
  const owner = await stubContactOwner(page);
  return { ...owner, writes };
}

async function stubSourceRecord(page: Page, kind: 'event' | 'stay'): Promise<unknown[]> {
  const writes: unknown[] = [];
  const role =
    kind === 'event'
      ? { path: '/trips-api/trips/7/events/19', field: 'organiserLinks', source }
      : {
          path: '/trips-api/trips/7/stays/13',
          field: 'hostLinks',
          source: {
            id: 13,
            tripId: 7,
            visitId: null,
            name: 'Source guesthouse',
            kind: 'hotel',
            status: 'Considering',
            timing: { arrival: '2029-04-10', departure: '2029-04-11' },
            address: '18 Source Lane',
            reference: null,
            notes: '',
            sourceLinks: [],
            hostLinks: [],
            documentLinks: [],
            ...audit,
          },
        };
  let links: { uri: string; label?: string }[] = [];
  await page.route(/\/trips-api\/trips\/7\/stays$/, (route) => json(route, 200, { stays: [] }));
  await page.route(/\/trips-api\/trips\/7$/, (route) =>
    json(route, 200, {
      id: 7,
      name: 'Source trip',
      destination: '',
      when: '',
      notes: '',
      sourceLinks: [],
      parentId: null,
      tagId: null,
      ...audit,
    })
  );
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/7\/visits$/, (route) => json(route, 200, { visits: [] }));
  await page.route(`**${role.path}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body: unknown = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1)
        return json(route, 503, {
          code: 'trips.temporarily_unavailable',
          message: 'Source write unavailable',
          retryable: true,
        });
      links = sourceLinks(body, role.field);
    }
    await json(route, 200, { ...role.source, [role.field]: links });
  });
  return writes;
}

async function stubContactOwner(page: Page): Promise<ContactOwnerState> {
  let creates = 0;
  let referenceAllowed = false;
  await page.route(/\/contacts-api\/entity-types$/, (route) =>
    json(route, 200, { types: ['person', 'organisation'], defaultType: 'organisation' })
  );
  await page.route(/\/contacts-api\/entities(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      creates += 1;
      return json(route, 201, { data: ownerEntity, message: 'Created' });
    }
    await json(route, 200, {
      data: [],
      pagination: { hasMore: false, limit: 50, offset: 0, total: 0 },
    });
  });
  await page.route(/\/contacts-api\/entities\/owner-organiser\/reference$/, (route) =>
    referenceAllowed
      ? json(route, 200, ownerReference)
      : json(route, 503, {
          code: 'contacts.unavailable',
          message: 'Owner read unavailable',
          retryable: true,
        })
  );
  await page.route(/\/contacts-api\/entities\/owner-organiser$/, (route) =>
    json(route, 200, { data: ownerEntity })
  );
  return {
    created: () => creates,
    allowReference: () => {
      referenceAllowed = true;
    },
    reference: ownerReference,
  };
}
function sourceLinks(value: unknown, field: string): { uri: string; label?: string }[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('organiserLinks' in value || 'hostLinks' in value)
  )
    throw new Error('Expected explicit source contact links');
  let links: unknown;
  if (field === 'hostLinks' && 'hostLinks' in value) links = value.hostLinks;
  else if (field === 'organiserLinks' && 'organiserLinks' in value) links = value.organiserLinks;
  else throw new Error('Expected the explicit source role');
  if (!Array.isArray(links)) throw new Error('Expected source reference array');
  const entries: unknown[] = links;
  if (!entries.every(isSourceLink)) throw new Error('Expected opaque source references');
  return entries;
}
function isSourceLink(link: unknown): link is { uri: string; label?: string } {
  return (
    typeof link === 'object' &&
    link !== null &&
    'uri' in link &&
    typeof link.uri === 'string' &&
    (!('label' in link) || typeof link.label === 'string')
  );
}
