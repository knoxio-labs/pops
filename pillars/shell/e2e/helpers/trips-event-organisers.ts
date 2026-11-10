import { json, stubShellBoot } from './pillar-rest';
import { stubUnavailableSourceDocuments } from './trips-source-documents';

import type { Page } from '@playwright/test';

const ownerEntity = {
  id: 'owner-organiser',
  name: 'New source organiser',
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
/** Actual remote and owner REST seams preserve independent Contact creation and Trips source failure. */
export async function stubEventOrganiserOwners(page: Page): Promise<{
  created: () => number;
  writes: unknown[];
  allowReference: () => void;
  reference: typeof ownerReference;
}> {
  await stubShellBoot(page, ['trips']);
  await stubUnavailableSourceDocuments(page, 7);
  let creates = 0;
  let referenceAllowed = false;
  const writes: unknown[] = [];
  let organiserLinks: { uri: string; label?: string }[] = [];
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
  await page.route(/\/trips-api\/trips\/7\/events\/19$/, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body: unknown = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1)
        return json(route, 503, {
          code: 'trips.temporarily_unavailable',
          message: 'Source write unavailable',
          retryable: true,
        });
      if (!isPatch(body)) throw new Error('Expected explicit organiser references');
      organiserLinks = body.organiserLinks;
    }
    await json(route, 200, { ...source, organiserLinks });
  });
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
    writes,
    allowReference: () => {
      referenceAllowed = true;
    },
    reference: ownerReference,
  };
}
function isPatch(value: unknown): value is { organiserLinks: { uri: string; label?: string }[] } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('organiserLinks' in value) ||
    !Array.isArray(value.organiserLinks)
  )
    return false;
  return value.organiserLinks.every(
    (link: unknown) =>
      typeof link === 'object' &&
      link !== null &&
      'uri' in link &&
      typeof link.uri === 'string' &&
      (!('label' in link) || typeof link.label === 'string')
  );
}
