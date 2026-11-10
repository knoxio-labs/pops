import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';

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

test('Calendar loads the configured remote, filters independent sources, and directly opens exact source identities at desktop and narrow widths', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await stubShellBoot(page, ['trips']);
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
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/7\/events\/60$/, (route) => json(route, 200, event));
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/trips/7/calendar');
  await expect(page.getByRole('heading', { name: 'Trip calendar' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Evening exhibition Start' }).click();
  await expect(page).toHaveURL(/\/trips\/7\/events\/60$/);
  await page.goto('/trips/7/calendar');
  await page.getByLabel('Display time zone').fill('Pacific/Auckland');
  await page.getByRole('button', { name: 'Harbour connection Departure' }).click();
  await expect(page).toHaveURL(/\/trips\/7\/journeys\/20$/);
  await expect(page.getByLabel('Transport mode')).toHaveValue('Hydrofoil');
  expect(errors).toEqual([]);
});

test('A required-source failure remains retryable and never becomes an empty calendar', async ({
  page,
}) => {
  await stubShellBoot(page, ['trips']);
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
  await expect(page.getByText('trips.events.unavailable')).toBeVisible();
  await expect(page.getByText('No entries in this range')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: /Try again/ }).click();
  await page.getByLabel('Display time zone').fill('Pacific/Auckland');
  await expect(page.getByText('No entries in this range')).toBeVisible();
});
