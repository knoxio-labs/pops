import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';

const timelineReads = {
  'meeting-plans': { meetingPlans: [] },
  'capture-workspace': {
    captures: [],
    ideas: [],
    associations: [],
    memberships: [],
    events: [],
    journeys: [],
    stays: [],
  },
  rentals: { rentals: [] },
  route: {
    tripId: 7,
    revision: 0,
    order: [
      { kind: 'visit' as const, id: 31 },
      { kind: 'visit' as const, id: 32 },
    ],
    paths: [],
    missingSources: [],
  },
};

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Trip overview source navigation and hierarchy at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const audit = { createdAt: '2029-01-01T00:00:00Z', updatedAt: '2029-01-01T00:00:00Z' };
    const trip = {
      id: 7,
      name: 'Coast trip',
      destination: '',
      when: 'After the exams',
      notes: '',
      parentId: null,
      tagId: null,
      sourceLinks: [],
      ...audit,
    };
    const visit = {
      id: 31,
      tripId: 7,
      placeId: 51,
      revision: 0,
      timing: { arrival: '2029-05-01' },
      notes: '',
      sourceLinks: [],
      ...audit,
    };
    const stay = {
      id: 13,
      tripId: 7,
      visitId: 31,
      name: 'Cedar guesthouse',
      kind: 'hotel',
      status: 'Purchased',
      timing: { arrival: '2029-05-01', departure: '2029-05-03' },
      address: null,
      reference: null,
      notes: '',
      sourceLinks: [],
      hostLinks: [],
      documentLinks: [],
      ...audit,
    };
    const event = {
      id: 61,
      tripId: 7,
      visitId: 31,
      name: 'Harbour festival',
      intention: 'Alternative',
      arrangement: 'Booked',
      purchase: null,
      timing: { start: '2029-05-02', startTime: '20:30' },
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
    await stubShellBoot(page, ['trips']);
    const responses = new Map<string, unknown>([
      ...Object.entries(timelineReads).map(
        ([collection, response]) => [`/trips/7/${collection}`, response] as const
      ),
      ['/trips', { trips: [trip] }],
      ['/trips/7', trip],
      ['/places', { places: [{ id: 51, name: 'Wellington', sourceLinks: [], ...audit }] }],
      ['/trips/7/visits', { visits: [visit, { ...visit, id: 32, timing: {} }] }],
      ['/trips/7/visits/31', visit],
      ['/trips/7/visits/32', { ...visit, id: 32, timing: {} }],
      ['/trips/7/stays', { stays: [stay] }],
      ['/trips/7/stays/13', stay],
      ['/trips/7/events', { events: [event] }],
      ['/trips/7/events/61', event],
      [
        '/trips/7/responsibilities/stay/13',
        { tripId: 7, targetKind: 'stay', targetId: 13, responsibility: null, revision: 0 },
      ],
      [
        '/trips/7/responsibilities/event/61',
        { tripId: 7, targetKind: 'event', targetId: 61, responsibility: null, revision: 0 },
      ],
      ['/trips/7/journeys', { journeys: [] }],
      ['/trips/7/journey-groups', { groups: [] }],
      [
        '/trips/7/decisions',
        {
          decisions: [
            {
              id: 9,
              tripId: 7,
              question: 'Which harbour transfer?',
              deadline: '2029-04-20',
              selectedOptionId: null,
              revision: 0,
              notes: '',
              sourceLinks: [],
              ...audit,
            },
          ],
        },
      ],
      [
        '/trips/7/document-associations',
        {
          associations: [
            {
              id: 1,
              tripId: 7,
              documentId: 102,
              targetKind: 'stay',
              targetId: 13,
              createdAt: audit.createdAt,
            },
          ],
        },
      ],
    ]);
    await page.route(/\/documents-api\/paperless\/status$/, (route) =>
      json(route, 200, {
        data: {
          configured: false,
          available: false,
          maxUploadBytes: 1000,
          allowedMimeTypes: ['application/pdf'],
        },
      })
    );
    await page.route(/\/documents-api\/paperless\/documents\/102$/, (route) =>
      json(route, 200, {
        data: {
          id: 102,
          title: 'Route original',
          created: '2029-01-01',
          originalFileName: 'route.pdf',
          thumbnailUrl: '',
        },
      })
    );
    let failEvents = false;
    const sourceReads: string[] = [];
    await page.route(/\/trips-api\//u, (route) => {
      const path = new URL(route.request().url()).pathname.replace('/trips-api', '');
      if (failEvents && path === '/trips/7/events')
        return json(route, 503, {
          code: 'trips.events.unavailable',
          message: 'Event source unavailable',
          retryable: true,
        });
      expect(route.request().method()).toBe('GET');
      sourceReads.push(path);
      const body = responses.get(path);
      if (!body) throw new Error(`Unexpected source request: ${path}`);
      return json(route, 200, body);
    });
    await page.goto('/trips');
    await page.getByRole('button', { name: /Coast trip/ }).click();
    await expect(page).toHaveURL(/\/trips\/7$/u);
    await expect(page.getByRole('heading', { name: 'Coast trip', exact: true })).toBeVisible();
    await expect(page.getByText('After the exams', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Wellington', exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Wellington', exact: true })).toHaveCount(2);
    for (const [index, id] of [31, 32].entries()) {
      await page.getByRole('button', { name: 'Wellington', exact: true }).nth(index).click();
      const dialog = page.getByRole('dialog', { name: `Visit #${id}`, exact: true });
      await expect(dialog.getByLabel('Visit notes', { exact: true })).toHaveValue('');
      await expect(page).toHaveURL(/\/trips\/7$/u);
      expect(sourceReads).toContain(`/trips/7/visits/${id}`);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    await expect(page.getByRole('link', { name: 'Documents', exact: true })).toHaveAttribute(
      'href',
      '/trips/7/documents'
    );
    await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toHaveCount(0);
    const eventCard = page.locator('article').filter({ hasText: 'Harbour festival' });
    await expect(eventCard).toHaveAttribute('data-constraint', 'soft');
    await expect(eventCard.getByText('Alternative', { exact: true })).toBeVisible();
    await expect(eventCard.getByText('Booked', { exact: true })).toBeVisible();
    const stayCard = page.locator('article').filter({ hasText: 'Cedar guesthouse' });
    await expect(stayCard).toHaveAttribute('data-constraint', 'hard');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
    if (viewport.width === 390) {
      const contentBounds = await page.getByRole('main').last().boundingBox();
      expect(contentBounds?.width).toBeGreaterThanOrEqual(viewport.width - 32);
    }
    const controls = page.getByRole('main').last().locator('a, button');
    for (const control of await controls.all()) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const artifacts = resolve(import.meta.dirname, '../../../tmp');
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({
      path: resolve(artifacts, `trips-overview-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Harbour festival', exact: true }).click();
    const eventDialog = page.getByRole('dialog', { name: 'Event #61', exact: true });
    await expect(eventDialog.getByLabel('Event name', { exact: true })).toHaveValue(
      'Harbour festival'
    );
    await expect(page).toHaveURL(/\/trips\/7$/u);
    expect(sourceReads).toContain('/trips/7/events/61');
    await eventDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Cedar guesthouse', exact: true }).click();
    const stayDialog = page.getByRole('dialog', { name: 'Stay #13', exact: true });
    await expect(stayDialog.getByLabel('Stay name', { exact: true })).toHaveValue(
      'Cedar guesthouse'
    );
    await expect(page).toHaveURL(/\/trips\/7$/u);
    expect(sourceReads).toContain('/trips/7/stays/13');
    await expect(stayDialog.getByText('Route original', { exact: true })).toBeVisible();
    await expect(
      stayDialog.getByRole('link', { name: 'Open original', exact: true })
    ).toHaveAttribute('href', '/documents-api/paperless/documents/102/download?original=true');
    await stayDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto('/trips/7/events/61');
    await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Harbour festival');
    await page.goto('/trips/7/stays/13');
    await expect(page.getByLabel('Stay name', { exact: true })).toHaveValue('Cedar guesthouse');
    await expect(
      page
        .getByRole('region', { name: 'Source documents', exact: true })
        .getByText('Route original', { exact: true })
    ).toBeVisible();
    failEvents = true;
    await page.goto('/trips/7');
    await expect(page.getByText('trips.events.unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cedar guesthouse', exact: true })).toBeVisible();
    await expect(page.getByText('No route entries.', { exact: true })).toHaveCount(0);
    failEvents = false;
    await page
      .getByRole('region', { name: 'Events', exact: true })
      .getByRole('button', { name: 'Try again', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Harbour festival', exact: true })).toBeVisible();
    await expect(page.getByText('trips.events.unavailable', { exact: true })).toHaveCount(0);
  });
}
