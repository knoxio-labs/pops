import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';
import { stubUnavailableSourceDocuments } from './helpers/trips-source-documents';

const trip = {
  id: 71,
  name: null,
  destination: 'Coastal journey',
  when: 'After the rainy season',
  parentId: null,
  tagId: null,
  notes: 'Bring a notebook',
  sourceLinks: [],
  createdAt: '2026-11-09T00:00:00Z',
  updatedAt: '2026-11-09T00:00:00Z',
};

test('Trips loads its real remote, creates permanently, and edits metadata through deep routes', async ({
  page,
}) => {
  const errors: string[] = [];
  const writes: string[] = [];
  let saved = { ...trip };
  page.on('pageerror', (error) => errors.push(error.message));
  await stubShellBoot(page, ['trips']);
  await page.route(/\/tags-api\/tags(?:\?.*)?$/, (route) => json(route, 200, { tags: [] }));
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/\d+\/visits$/, (route) => json(route, 200, { visits: [] }));
  for (const [collection, response] of [
    ['stays', { stays: [] }],
    ['events', { events: [] }],
    ['journeys', { journeys: [] }],
    ['journey-groups', { groups: [] }],
    ['decisions', { decisions: [] }],
    ['document-associations', { associations: [] }],
  ] as const) {
    await page.route(new RegExp(`/trips-api/trips/72/${collection}$`), (route) =>
      json(route, 200, response)
    );
  }
  await page.route(/\/trips-api\/trips$/, async (route) => {
    if (route.request().method() === 'POST') {
      writes.push('POST');
      const body: Record<string, unknown> = route.request().postDataJSON();
      saved = { ...trip, id: 72, destination: String(body.destination), when: String(body.when) };
      await json(route, 201, saved);
    } else await json(route, 200, { trips: [saved] });
  });
  await page.route(/\/trips-api\/trips\/\d+$/, async (route) => {
    if (route.request().method() === 'PATCH') {
      writes.push('PATCH');
      const body: Record<string, unknown> = route.request().postDataJSON();
      saved = { ...saved, destination: String(body.destination), when: String(body.when) };
    }
    await json(route, 200, saved);
  });
  await page.goto('/trips');
  await expect(page.getByRole('button', { name: 'Trips', exact: true }).locator('svg')).toHaveClass(
    /lucide-plane/
  );
  await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Coastal journey/ })).toBeVisible();
  await expect(page.locator('link[href*="/trips-ui/trips.css"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  await page.getByRole('textbox', { name: 'Destination', exact: true }).fill('Hill country');
  await page.getByRole('textbox', { name: 'When', exact: true }).fill('Whenever the ferry resumes');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/72$/);
  await expect(page.getByRole('heading', { name: 'Hill country', exact: true })).toBeVisible();
  await expect(page.getByText('Whenever the ferry resumes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path] of [
      ['Calendar', 'calendar'],
      ['Documents', 'documents'],
    ]) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', `/trips/72/${path}`);
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: `../../tmp/trips-documents/preview-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto('/trips/72/settings');
  await expect(page.getByRole('textbox', { name: 'Destination', exact: true })).toHaveValue(
    'Hill country'
  );
  await page.getByRole('textbox', { name: 'Destination', exact: true }).fill('Highland journey');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Destination', exact: true })).toHaveValue(
    'Hill country'
  );
  await page.goto('/trips/nope/stays/1');
  await expect(page.getByText('Choose a valid trip and stay', { exact: true })).toBeVisible();
  expect(writes).toEqual(['POST', 'PATCH', 'PATCH']);
  expect(errors).toEqual([]);
});

test('Trips shows source errors, retries to an empty home, and keeps creation available', async ({
  page,
}) => {
  let fail = true;
  await stubShellBoot(page, ['trips']);
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips$/, (route) =>
    fail
      ? json(route, 503, {
          code: 'trips.unavailable',
          message: 'Trips unavailable',
          retryable: true,
        })
      : json(route, 200, { trips: [] })
  );
  await page.goto('/trips');
  await expect(page.getByText('Trips unavailable', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: /Try again/ }).click();
  await expect(page.getByText('No trips found.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New trip', exact: true })).toBeEnabled();
});

test('A real stay identity mounts the existing source-backed workspace through the shell', async ({
  page,
}) => {
  const stay = {
    id: 83,
    tripId: 71,
    visitId: null,
    name: 'Harbour cottage',
    kind: null,
    status: 'Considering',
    timing: {},
    address: null,
    reference: null,
    notes: '',
    sourceLinks: [],
    hostLinks: [],
    documentLinks: [],
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
  await stubShellBoot(page, ['trips']);
  await stubUnavailableSourceDocuments(page, 71);
  await page.route(/\/trips-api\/trips\/71$/, (route) => json(route, 200, trip));
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/71\/visits$/, (route) => json(route, 200, { visits: [] }));
  await page.route(/\/trips-api\/trips\/71\/stays$/, (route) =>
    json(route, 200, { stays: [stay] })
  );
  await page.route(/\/trips-api\/trips\/71\/stays\/83$/, (route) => json(route, 200, stay));
  await page.goto('/trips/71/stays/83');
  await expect(page.getByRole('textbox', { name: 'Stay name', exact: true })).toHaveValue(
    'Harbour cottage'
  );
  await expect(page.getByRole('heading', { name: 'Stay detail', exact: true })).toBeVisible();
  const editor = page.getByRole('article', { name: 'Stay editor', exact: true });
  await expect(editor).toHaveCSS('border-style', 'dashed');
  await page.evaluate(() => {
    const sheet = Array.from(document.styleSheets).find((candidate) =>
      candidate.href?.includes('/trips-ui/trips.css')
    );
    if (!sheet) throw new Error('Trips remote stylesheet was not installed');
    sheet.disabled = true;
  });
  await expect(editor).toHaveCSS('border-style', 'dashed');
  await page.evaluate(() => {
    for (const sheet of document.styleSheets)
      sheet.disabled = !sheet.href?.includes('/trips-ui/trips.css');
  });
  await expect(editor).not.toHaveCSS('border-style', 'dashed');
});
