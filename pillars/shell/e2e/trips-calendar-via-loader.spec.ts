import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

const audit = { createdAt: '2029-01-01T00:00:00Z', updatedAt: '2029-01-01T00:00:00Z' };
const journey = {
  id: 20,
  tripId: 7,
  name: 'Harbour connection',
  reference: null,
  notes: '',
  sourceLinks: [],
  buffers: {},
  ...audit,
};
const leg = {
  id: 40,
  journeyId: 20,
  mode: 'Hydrofoil',
  from: { local: '2029-02-01T22:15', timeZone: 'Pacific/Auckland' },
  to: { local: '2029-02-02T01:15', timeZone: 'Pacific/Auckland' },
  intention: 'Considering',
  arrangement: 'Booked',
  purchase: null,
  operator: null,
  service: null,
  reference: null,
  notes: '',
  sourceLinks: [],
  ...audit,
};
const timing = {
  journeyId: 20,
  legs: [
    {
      legId: 40,
      departure: '2029-02-01T09:15:00Z',
      arrival: '2029-02-01T12:15:00Z',
      elapsedMinutes: 180,
    },
  ],
  connections: [],
  window: { from: '2029-01-31T11:00:00Z', toExclusive: '2029-02-03T11:00:00Z' },
  findings: [],
};
const event = {
  id: 60,
  tripId: 7,
  visitId: null,
  name: 'Evening exhibition',
  intention: 'Alternative',
  arrangement: 'Booked',
  purchase: null,
  timing: { start: '2029-02-01', startTime: '20:30', timeZone: 'Pacific/Auckland' },
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
const stay = {
  id: 30,
  tripId: 7,
  visitId: null,
  name: 'Harbour house',
  kind: 'hotel',
  status: 'Purchased',
  timing: { arrival: '2029-02-01', departure: '2029-02-04' },
  address: null,
  reference: null,
  notes: '',
  sourceLinks: [],
  hostLinks: [],
  documentLinks: [],
  ...audit,
};

test('Calendar URL loads inline Timeline filters and opens exact source sheets at desktop and narrow widths', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await stubShellBoot(page, ['trips']);
  await stubTimelineSources(page, [{ kind: 'journey', id: 20 }]);
  await page.route(/\/documents-api\/paperless\/status$/, (route) =>
    route.request().method() === 'GET'
      ? json(route, 200, {
          data: {
            configured: true,
            available: true,
            baseUrl: 'https://paperless.example',
            documentCount: 0,
            maxUploadBytes: 1000,
            allowedMimeTypes: ['application/pdf'],
          },
        })
      : route.fallback()
  );
  await page.route(/\/trips-api\/trips\/7\/journeys$/, (route) =>
    json(route, 200, { journeys: [journey] })
  );
  await page.route(/\/trips-api\/trips\/7\/journey-groups$/, (route) =>
    json(route, 200, { groups: [] })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20\/workspace$/, (route) =>
    json(route, 200, { journey, legs: [leg], timing })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20\/legs$/, (route) =>
    json(route, 200, { revision: 0, legs: [leg] })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20\/timing$/, (route) =>
    json(route, 200, timing)
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20$/, (route) => json(route, 200, journey));
  await page.route(/\/trips-api\/trips\/7\/events$/, (route) =>
    json(route, 200, { events: [event] })
  );
  await page.route(/\/trips-api\/trips\/7\/stays$/, (route) => json(route, 200, { stays: [stay] }));
  await page.route(/\/trips-api\/trips\/7\/events\/60$/, (route) => json(route, 200, event));
  await page.route(/\/trips-api\/trips\/7\/responsibilities\/event\/60$/, (route) =>
    route.request().method() === 'GET'
      ? json(route, 200, {
          tripId: 7,
          targetKind: 'event',
          targetId: 60,
          responsibility: null,
          revision: 0,
        })
      : route.fallback()
  );
  await page.route(/\/trips-api\/trips\/7\/responsibilities\/journey\/20$/, (route) =>
    route.request().method() === 'GET'
      ? json(route, 200, {
          tripId: 7,
          targetKind: 'journey',
          targetId: 20,
          responsibility: null,
          revision: 0,
        })
      : route.fallback()
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/trips/7/calendar');
  await expect(page.getByRole('heading', { name: 'Harbour trip', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByLabel('Display time zone')).toHaveValue('');
  await page.getByLabel('Display time zone').fill('Pacific/Auckland');
  await expect(page.getByRole('button', { name: 'Evening exhibition Start' })).toBeVisible();
  await expect(page.getByText('Start · Alternative · Booked', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Harbour house Check-in' })).toHaveCSS(
    'border-style',
    'solid'
  );
  await expect(page.getByRole('button', { name: 'Evening exhibition Start' })).toHaveCSS(
    'border-style',
    'dashed'
  );
  await page.getByLabel('Journey window').selectOption('20');
  await expect(page.getByText(/Journey window: 2029-01-31T11:00:00Z/)).toBeVisible();
  await page.screenshot({
    path: new URL('../../../tmp/calendar-desktop.png', import.meta.url).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Evening exhibition Start' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false
  );
  await page.screenshot({
    path: new URL('../../../tmp/calendar-narrow.png', import.meta.url).pathname,
    fullPage: true,
  });
  await page.getByLabel('Kind').selectOption('stay');
  await page.getByLabel('From date').fill('2029-02-02');
  await page.getByLabel('To date').fill('2029-02-03');
  await expect(page.getByText('Continuing · Purchased', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Evening exhibition Start' })).toHaveCount(0);
  await page.getByLabel('Kind').selectOption('event');
  await page.getByLabel('From date').fill('2029-02-03');
  await page.getByLabel('To date').fill('2029-02-01');
  await expect(page.getByRole('alert')).toContainText('Choose a valid date range');
  await page.getByLabel('From date').fill('2029-02-01');
  await page.getByLabel('To date').fill('2029-02-01');
  const eventRead = page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/trips-api/trips/7/events/60'
  );
  await page.getByRole('button', { name: 'Evening exhibition Start' }).click();
  await eventRead;
  const eventSheet = page.getByRole('dialog', { name: 'Event #60', exact: true });
  await expect(eventSheet).toBeVisible();
  await expect(eventSheet.getByLabel('Event name', { exact: true })).toHaveValue(
    'Evening exhibition'
  );
  await expect(page).toHaveURL(/\/trips\/7\/calendar$/);
  await eventSheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(eventSheet).toHaveCount(0);
  await expect(page.getByLabel('Display time zone')).toHaveValue('Pacific/Auckland');
  await expect(page.getByLabel('Kind', { exact: true })).toHaveValue('event');
  await page.getByLabel('Kind', { exact: true }).selectOption('all');
  await page.getByLabel('From date').fill('');
  await page.getByLabel('To date').fill('');
  const journeyRead = page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/trips-api/trips/7/journeys/20/workspace'
  );
  await page.getByRole('button', { name: 'Harbour connection Departure' }).click();
  await journeyRead;
  const journeySheet = page.getByRole('dialog', { name: 'Journey #20', exact: true });
  await expect(journeySheet).toBeVisible();
  await expect(page).toHaveURL(/\/trips\/7\/calendar$/);
  await expect(journeySheet.getByLabel('Transport mode')).toHaveValue('Hydrofoil');
  expect(errors).toEqual([]);
});

test('A required-source failure remains retryable and never becomes an empty calendar', async ({
  page,
}) => {
  await stubShellBoot(page, ['trips']);
  await stubTimelineSources(page);
  let unavailable = true;
  await page.route(/\/trips-api\/trips\/7\/journeys$/, (route) =>
    json(route, 200, { journeys: [] })
  );
  await page.route(/\/trips-api\/trips\/7\/journey-groups$/, (route) =>
    json(route, 200, { groups: [] })
  );
  await page.route(/\/trips-api\/trips\/7\/stays$/, (route) => json(route, 200, { stays: [] }));
  await page.route(/\/trips-api\/trips\/7\/events$/, (route) =>
    json(
      route,
      unavailable ? 503 : 200,
      unavailable
        ? {
            code: 'trips.events.unavailable',
            message: 'Events could not be loaded',
            retryable: true,
          }
        : { events: [] }
    )
  );
  await page.goto('/trips/7/calendar');
  const calendar = page.getByRole('region', { name: 'Calendar', exact: true });
  await expect(calendar.getByText('trips.events.unavailable')).toBeVisible();
  await expect(page.getByText('No entries in this range')).toHaveCount(0);
  unavailable = false;
  await calendar.getByRole('button', { name: /Try again/ }).click();
  await page.getByLabel('Display time zone').fill('Pacific/Auckland');
  await expect(calendar.getByText('No entries in this range')).toBeVisible();
});

async function stubTimelineSources(page: Page, order: { kind: 'journey'; id: number }[] = []) {
  await page.route(/\/trips-api\/trips\/7\/document-associations$/, (route) =>
    route.request().method() === 'GET' ? json(route, 200, { associations: [] }) : route.fallback()
  );
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/7\/visits$/, (route) => json(route, 200, { visits: [] }));
  await page.route(/\/trips-api\/trips\/7$/, (route) =>
    json(route, 200, {
      id: 7,
      name: 'Harbour trip',
      destination: '',
      when: '',
      parentId: null,
      tagId: null,
      notes: '',
      sourceLinks: [],
      ...audit,
    })
  );
  await page.route(/\/trips-api\/trips\/7\/decisions$/, (route) =>
    route.request().method() === 'GET' ? json(route, 200, { decisions: [] }) : route.fallback()
  );
  await page.route(/\/trips-api\/trips\/7\/meeting-plans$/, (route) =>
    route.request().method() === 'GET' ? json(route, 200, { meetingPlans: [] }) : route.fallback()
  );
  await page.route(/\/trips-api\/trips\/7\/capture-workspace$/, (route) =>
    route.request().method() === 'GET'
      ? json(route, 200, {
          captures: [],
          ideas: [],
          associations: [],
          memberships: [],
          events: [],
          journeys: [],
          stays: [],
        })
      : route.fallback()
  );
  await page.route(/\/trips-api\/trips\/7\/rentals$/, (route) =>
    route.request().method() === 'GET' ? json(route, 200, { rentals: [] }) : route.fallback()
  );
  await page.route(/\/trips-api\/trips\/7\/route$/, (route) =>
    route.request().method() === 'GET'
      ? json(route, 200, {
          tripId: 7,
          revision: 0,
          order,
          paths: [],
          missingSources: [],
        })
      : route.fallback()
  );
}
