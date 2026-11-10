import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';

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
      ['/trips', { trips: [trip] }],
      ['/trips/7', trip],
      ['/places', { places: [{ id: 51, name: 'Wellington', sourceLinks: [], ...audit }] }],
      ['/trips/7/visits', { visits: [visit, { ...visit, id: 32, timing: {} }] }],
      ['/trips/7/stays', { stays: [stay] }],
      ['/trips/7/stays/13', stay],
      ['/trips/7/events', { events: [event] }],
      ['/trips/7/events/61', event],
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
    await page.route(/\/trips-api\//u, (route) => {
      const path = new URL(route.request().url()).pathname.replace('/trips-api', '');
      if (failEvents && path === '/trips/7/events')
        return json(route, 503, {
          code: 'trips.events.unavailable',
          message: 'Event source unavailable',
          retryable: true,
        });
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
    await expect(page.getByRole('link', { name: 'Wellington', exact: true })).toHaveCount(2);
    expect(
      await page
        .getByRole('link', { name: 'Wellington', exact: true })
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    ).toEqual(['/trips/7/visits/31', '/trips/7/visits/32']);
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
    const links = page.getByRole('main').last().getByRole('link');
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const artifacts = resolve(import.meta.dirname, '../../../tmp');
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({
      path: resolve(artifacts, `trips-overview-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('link', { name: /Harbour festival/ }).click();
    await expect(page).toHaveURL(/\/trips\/7\/events\/61$/u);
    await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Harbour festival');
    await page.goto('/trips/7');
    await page.getByRole('link', { name: /Cedar guesthouse/ }).click();
    await expect(page).toHaveURL(/\/trips\/7\/stays\/13$/u);
    await expect(page.getByLabel('Stay name', { exact: true })).toHaveValue('Cedar guesthouse');
    failEvents = true;
    await page.goto('/trips/7');
    await expect(page.getByText('trips.events.unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cedar guesthouse/ })).toBeVisible();
    await expect(page.getByText('No route entries.', { exact: true })).toHaveCount(0);
  });
}
