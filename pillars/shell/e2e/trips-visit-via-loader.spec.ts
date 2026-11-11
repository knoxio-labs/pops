import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';

const timestamp = '2030-01-01T00:00:00Z';
const source = {
  id: 31,
  tripId: 7,
  placeId: 51,
  revision: 0,
  timing: {
    arrival: '2030-04-10',
    departure: '2030-04-18',
    duration: { max: 2.5, unit: 'weeks' },
  },
  notes: 'Independent visit source',
  sourceLinks: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

for (const width of [1440, 390]) {
  test(`Visit remote persists guarded edits and Undo across repeated-place routes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubShellBoot(page, ['trips']);
    const errors: string[] = [];
    const writes: unknown[] = [];
    let visit = structuredClone(source);
    const repeated = { ...source, id: 32, timing: {} };
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/\/trips-api\/trips\/7$/, (route) =>
      json(route, 200, {
        id: 7,
        name: 'Coast trip',
        destination: '',
        when: '',
        notes: '',
        sourceLinks: [],
        parentId: null,
        tagId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
    await page.route(/\/trips-api\/places$/, (route) =>
      json(route, 200, {
        places: [
          {
            id: 51,
            name: 'Wellington',
            sourceLinks: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      })
    );
    await page.route(/\/trips-api\/trips\/7\/visits$/, (route) =>
      json(route, 200, { visits: [visit, repeated] })
    );
    await page.route(/\/trips-api\/trips\/7\/stays$/, (route) => json(route, 200, { stays: [] }));
    await page.route(/\/trips-api\/trips\/7\/events$/, (route) => json(route, 200, { events: [] }));
    await page.route(/\/trips-api\/trips\/7\/visits\/32$/, (route) => json(route, 200, repeated));
    await page.route(/\/trips-api\/trips\/7\/visits\/31$/, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body: unknown = route.request().postDataJSON();
        writes.push(body);
        if (writes.length === 1) {
          expect(body).toEqual({
            expectedRevision: 0,
            timing: { ...source.timing, arrival: '2030-04-11' },
          });
          visit = { ...visit, revision: 1, timing: { ...source.timing, arrival: '2030-04-11' } };
        } else {
          expect(writes).toHaveLength(2);
          expect(body).toEqual({
            expectedRevision: 1,
            placeId: source.placeId,
            timing: source.timing,
            notes: source.notes,
            sourceLinks: source.sourceLinks,
          });
          visit = { ...source, revision: 2 };
        }
      }
      await json(route, 200, visit);
    });
    await page.goto('/trips/7/visits/31');
    await expect(page.getByRole('heading', { name: 'Wellington', exact: true })).toBeVisible();
    await page.getByLabel('Arrival', { exact: true }).fill('2030-04-11');
    await page.getByLabel('Arrival', { exact: true }).blur();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    const undoResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname === '/trips-api/trips/7/visits/31'
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const acknowledgedUndo = await undoResponse;
    expect(acknowledgedUndo.status()).toBe(200);
    await acknowledgedUndo.finished();
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Arrival', { exact: true })).toHaveValue(source.timing.arrival);
    expect(writes).toHaveLength(2);
    await page.reload();
    await expect(page.getByLabel('Arrival', { exact: true })).toHaveValue(source.timing.arrival);
    await page.getByLabel('Visit', { exact: true }).selectOption('32');
    await expect(page).toHaveURL('/trips/7/visits/32');
    await expect(page.getByLabel('Arrival', { exact: true })).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Wellington', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.goto('/trips/invalid/visits/32');
    await expect(page.getByText('Choose a valid trip and visit', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
