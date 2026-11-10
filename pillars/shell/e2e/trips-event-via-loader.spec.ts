import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';
import { stubEventDocuments } from './helpers/trips-source-documents';

const eventSource = {
  id: 19,
  tripId: 7,
  visitId: 31,
  name: 'Harbour performance',
  intention: 'Considering',
  arrangement: 'Not arranged',
  purchase: null,
  timing: { start: '2029-04-12' },
  address: 'South quay',
  reference: null,
  sourceUrl: null,
  ticketUrl: null,
  notes: '',
  sourceLinks: [],
  venueLinks: [],
  organiserLinks: [],
  documentLinks: [],
  createdAt: '2029-01-01T00:00:00Z',
  updatedAt: '2029-01-01T00:00:00Z',
};

for (const width of [1440, 390]) {
  test(`Event remote preserves source facts and persists Undo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubShellBoot(page, ['trips']);
    const documents = await stubEventDocuments(page);
    const errors: string[] = [];
    const writes: unknown[] = [];
    let purchase: 'Purchased' | null = null;
    page.on('pageerror', (error) => errors.push(error.message));
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
        createdAt: eventSource.createdAt,
        updatedAt: eventSource.updatedAt,
      })
    );
    await page.route(/\/trips-api\/places$/, (route) =>
      json(route, 200, {
        places: [
          {
            id: 51,
            name: 'North inlet',
            sourceLinks: [],
            createdAt: eventSource.createdAt,
            updatedAt: eventSource.updatedAt,
          },
          {
            id: 52,
            name: 'Harbour city',
            sourceLinks: [],
            createdAt: eventSource.createdAt,
            updatedAt: eventSource.updatedAt,
          },
          {
            id: 53,
            name: 'South island',
            sourceLinks: [],
            createdAt: eventSource.createdAt,
            updatedAt: eventSource.updatedAt,
          },
        ],
      })
    );
    await page.route(/\/trips-api\/trips\/7\/visits$/, (route) =>
      json(route, 200, {
        visits: [
          { id: 90, placeId: 51 },
          { id: 31, placeId: 52 },
          { id: 2, placeId: 53 },
        ].map((visit) => ({
          ...visit,
          tripId: 7,
          timing: {},
          notes: '',
          sourceLinks: [],
          createdAt: eventSource.createdAt,
          updatedAt: eventSource.updatedAt,
        })),
      })
    );
    await page.route(/\/trips-api\/trips\/7\/events\/19$/, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body: Record<string, unknown> = route.request().postDataJSON();
        writes.push(body);
        if (body.purchase === 'Purchased' || body.purchase === null) purchase = body.purchase;
      }
      await json(route, 200, { ...eventSource, purchase });
    });
    await page.goto('/trips/7/events/19');
    await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Harbour performance');
    await expect(
      page.getByRole('region', { name: 'Event route context' }).getByRole('heading', { level: 2 })
    ).toHaveText(['North inlet', 'Harbour city', 'South island']);
    await expect(page.getByLabel('Time zone', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('');
    await page.getByLabel('Purchase', { exact: true }).selectOption('Purchased');
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Event editor' })).toHaveClass(/border-l-4/);
    await expect(page.getByLabel('Intention', { exact: true })).toHaveValue('Considering');
    await expect(page.getByLabel('Arrangement', { exact: true })).toHaveValue('Not arranged');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Purchase', { exact: true })).toHaveValue('');
    await expect(page.getByRole('article', { name: 'Event editor' })).toHaveClass(/border-dashed/);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({ purchase: 'Purchased' });
    const { id, tripId, createdAt, updatedAt, ...snapshot } = eventSource;
    expect([id, tripId, createdAt, updatedAt]).toHaveLength(4);
    expect(writes[1]).toEqual(snapshot);
    const files = page.getByRole('region', { name: 'Source documents' });
    await expect(files.getByText('Owner ticket', { exact: true })).toBeVisible();
    await files.getByRole('button', { name: 'Unlink Owner ticket' }).click();
    await expect(files.getByText('Owner ticket', { exact: true })).toHaveCount(0);
    await files.getByRole('button', { name: 'Choose existing document' }).click();
    await page.getByPlaceholder('Search documents...').fill('ticket');
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(files.getByText('Owner ticket', { exact: true })).toBeVisible();
    expect(documents.writes).toEqual([
      { method: 'DELETE', path: '/trips-api/trips/7/document-associations/81' },
      { documentId: 91, targetKind: 'event', targetId: 19 },
    ]);
    expect(writes).toHaveLength(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect(errors).toEqual([]);
    await page.goto('/trips/invalid/events/19');
    await expect(page.getByText('Choose a valid trip and event', { exact: true })).toBeVisible();
  });
}
