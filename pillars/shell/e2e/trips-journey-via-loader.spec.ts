import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';
import { stubUnavailableSourceDocuments } from './helpers/trips-source-documents';

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
  from: {
    sourceLabel: 'Old wharf',
    local: '2029-02-01T22:15:00.123456789',
    sourceLinks: [{ uri: 'pops:documents/source/departure' }],
  },
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

const legConflict = {
  code: 'trips.journey_leg.leg_revision_conflict',
  message: 'Legs changed',
  retryable: false,
};
function matchesLegRevision(body: unknown, revision: number): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'expectedRevision' in body &&
    body.expectedRevision === revision
  );
}

test('A real journey deep route loads the built remote and preserves endpoint source through edit and Undo', async ({
  page,
}) => {
  const errors: string[] = [];
  const patches: unknown[] = [];
  let currentLeg: typeof leg & { from: typeof leg.from & { timeZone?: string } } = leg;
  let legRevision = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await stubShellBoot(page, ['trips']);
  await stubUnavailableSourceDocuments(page, 7);
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/7\/journey-groups$/, (route) =>
    json(route, 200, { groups: [] })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20$/, (route) => json(route, 200, journey));
  await page.route(/\/trips-api\/trips\/7\/journeys\/20\/legs$/, (route) =>
    json(route, 200, { revision: legRevision, legs: [currentLeg] })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20\/timing$/, (route) =>
    json(route, 200, { journeyId: 20, legs: [], connections: [], window: null, findings: [] })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20\/legs\/40$/, async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (!matchesLegRevision(body, legRevision)) {
      await json(route, 409, legConflict);
      return;
    }
    patches.push(body);
    currentLeg =
      patches.length === 1 ? { ...leg, from: { ...leg.from, timeZone: 'Pacific/Auckland' } } : leg;
    legRevision += 1;
    await json(route, 200, currentLeg);
  });
  await page.goto('/trips/7/journeys/20');
  await expect(page.getByRole('heading', { name: 'Harbour connection' })).toBeVisible();
  await expect(page.getByLabel('Transport mode')).toHaveValue('Hydrofoil');
  await expect(page.getByRole('article', { name: 'Transport leg 1' })).toHaveCSS(
    'border-style',
    'dashed'
  );
  await expect(page.getByLabel('Departure local time')).toHaveValue(leg.from.local);
  await page.getByLabel('Departure local time').focus();
  await page.getByLabel('Departure local time').blur();
  expect(patches).toEqual([]);
  await expect(page.getByText('Departure time zone unknown')).toBeVisible();
  await page.getByLabel('Departure time zone').fill('Pacific/Auckland');
  await page.getByLabel('Departure time zone').blur();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  expect(patches[0]).toEqual({
    from: { ...leg.from, timeZone: 'Pacific/Auckland', date: null },
    expectedRevision: 0,
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Departure time zone')).toHaveValue('');
  expect(patches).toHaveLength(2);
  expect(patches[1]).toMatchObject({
    expectedRevision: 1,
    from: { ...leg.from, date: null },
    to: { ...leg.to, date: null },
    arrangement: 'Booked',
    purchase: null,
  });
  await page.screenshot({
    path: new URL('../../../tmp/journey-desktop.png', import.meta.url).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Transport mode')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Transport leg 1' })).toHaveCSS(
    'border-style',
    'dashed'
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: new URL('../../../tmp/journey-narrow.png', import.meta.url).pathname,
    fullPage: true,
  });
  await page.goto('/trips/7/journeys/not-an-id');
  await expect(page.getByText('trips.identity.invalid')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Journey selection replaces the literal source URL and Undo restores the original view after the revisioned inverse', async ({
  page,
}) => {
  const errors: string[] = [];
  const selections: unknown[] = [];
  const legPatches: unknown[] = [];
  let group = {
    id: 80,
    tripId: 7,
    currentJourneyId: 20,
    alternativeJourneyIds: [21],
    revision: 3,
    ...audit,
  };
  let optionLeg = { ...leg, id: 41, journeyId: 21, mode: 'Night coach' };
  let optionLegRevision = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await stubShellBoot(page, ['trips']);
  await stubUnavailableSourceDocuments(page, 7);
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/7\/journey-groups$/, (route) =>
    json(route, 200, { groups: [group] })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/(20|21)$/, (route) =>
    json(
      route,
      200,
      route.request().url().endsWith('/21')
        ? { ...journey, id: 21, name: 'Independent option' }
        : journey
    )
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/(20|21)\/legs$/, (route) =>
    json(route, 200, {
      revision: route.request().url().includes('/journeys/21/') ? optionLegRevision : 0,
      legs: [route.request().url().includes('/journeys/21/') ? optionLeg : leg],
    })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/(20|21)\/timing$/, (route) =>
    json(route, 200, {
      journeyId: route.request().url().includes('/journeys/21/') ? 21 : 20,
      legs: [],
      connections: [],
      window: null,
      findings: [],
    })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/21\/legs\/41$/, async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (!matchesLegRevision(body, optionLegRevision)) {
      await json(route, 409, legConflict);
      return;
    }
    optionLegRevision += 1;
    legPatches.push(body);
    optionLeg = { ...optionLeg, mode: 'Sleeper coach' };
    await json(route, 200, optionLeg);
  });
  await page.route(/\/trips-api\/trips\/7\/journey-groups\/80\/selection$/, async (route) => {
    const body: unknown = route.request().postDataJSON();
    selections.push(body);
    if (
      !body ||
      typeof body !== 'object' ||
      !('journeyId' in body) ||
      typeof body.journeyId !== 'number' ||
      !('expectedRevision' in body) ||
      body.expectedRevision !== group.revision
    ) {
      await json(route, 409, {
        code: 'trips.group.stale',
        message: 'Selection changed',
        retryable: false,
      });
      return;
    }
    group = {
      ...group,
      currentJourneyId: body.journeyId,
      alternativeJourneyIds: [group.currentJourneyId],
      revision: group.revision + 1,
    };
    await json(route, 200, group);
  });
  await page.goto('/trips/7/journeys/20');
  await expect(page.getByRole('heading', { name: 'Harbour connection', level: 1 })).toBeVisible();
  const historyLength = await page.evaluate(() => window.history.length);
  await page.getByRole('button', { name: 'Use journey' }).click();
  await expect(page).toHaveURL(/\/trips\/7\/journeys\/21$/);
  await expect(page.getByRole('heading', { name: 'Independent option', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  await page.getByLabel('Transport mode').fill('Sleeper coach');
  await page.getByLabel('Transport mode').blur();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  expect(legPatches).toEqual([{ mode: 'Sleeper coach', expectedRevision: 0 }]);
  await page.getByRole('button', { name: 'Undo selection' }).click();
  await expect(page).toHaveURL(/\/trips\/7\/journeys\/20$/);
  await expect(page.getByLabel('Transport mode')).toHaveValue('Hydrofoil');
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  expect(selections).toEqual([
    { journeyId: 21, expectedRevision: 3 },
    { journeyId: 20, expectedRevision: 4 },
  ]);
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`Existing leg Remove and persisted Undo retain source identity and order at ${width}px`, async ({
    page,
  }) => {
    const first = {
      ...leg,
      purchase: 'Purchased',
      sourceLinks: [{ uri: 'pops:documents/document/42', label: 'Original purchase document' }],
    };
    const second = { ...leg, id: 41, mode: 'Night coach' };
    const initialLegs = [first, second];
    let currentLegs = initialLegs;
    let revision = 0;
    let receipt:
      | {
          operationId: string;
          legId: number;
          state: 'removed' | 'restored';
          removedRevision: number;
          restoredRevision: number | null;
        }
      | undefined;
    const mutations: unknown[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await stubShellBoot(page, ['trips']);
    await stubUnavailableSourceDocuments(page, 7);
    await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
    await page.route(/\/trips-api\/trips\/7\/journey-groups$/, (route) =>
      json(route, 200, { groups: [] })
    );
    await page.route(/\/trips-api\/trips\/7\/journeys\/20$/, (route) => json(route, 200, journey));
    await page.route(/\/trips-api\/trips\/7\/journeys\/20\/legs$/, (route) =>
      json(route, 200, { revision, legs: currentLegs })
    );
    await page.route(/\/trips-api\/trips\/7\/journeys\/20\/timing$/, (route) =>
      json(route, 200, { journeyId: 20, legs: [], connections: [], window: null, findings: [] })
    );
    await page.route(/\/trips-api\/trips\/7\/journeys\/20\/legs\/40\/removals$/, async (route) => {
      const body: unknown = route.request().postDataJSON();
      if (
        !matchesLegRevision(body, revision) ||
        typeof body !== 'object' ||
        body === null ||
        !('operationId' in body) ||
        typeof body.operationId !== 'string'
      ) {
        await json(route, 409, legConflict);
        return;
      }
      mutations.push(body);
      currentLegs = [second];
      revision += 1;
      receipt = {
        operationId: body.operationId,
        legId: first.id,
        state: 'removed',
        removedRevision: revision,
        restoredRevision: null,
      };
      await json(route, 200, { revision, legs: currentLegs, receipt });
    });
    await page.route(
      /\/trips-api\/trips\/7\/journeys\/20\/leg-removals\/[^/]+\/restore$/,
      async (route) => {
        const body: unknown = route.request().postDataJSON();
        if (
          !receipt ||
          !matchesLegRevision(body, revision) ||
          !route.request().url().endsWith(`/${receipt.operationId}/restore`)
        ) {
          await json(route, 409, legConflict);
          return;
        }
        mutations.push(body);
        currentLegs = initialLegs;
        revision += 1;
        receipt = { ...receipt, state: 'restored', restoredRevision: revision };
        await json(route, 200, { revision, legs: currentLegs, receipt });
      }
    );
    await page.goto('/trips/7/journeys/20');
    await expect(page.getByLabel('Transport mode')).toHaveCount(2);
    const remove = page.getByRole('button', { name: 'Remove transport leg 1', exact: true });
    const bounds = await remove.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await remove.click();
    await expect(page.getByLabel('Transport mode')).toHaveCount(1);
    await expect(page.getByLabel('Transport mode')).toHaveValue('Night coach');
    expect(currentLegs.map((entry) => entry.id)).toEqual([41]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Transport mode')).toHaveCount(2);
    await expect(page.getByLabel('Transport mode').nth(0)).toHaveValue('Hydrofoil');
    await expect(page.getByLabel('Transport mode').nth(1)).toHaveValue('Night coach');
    expect(currentLegs).toEqual(initialLegs);
    expect(receipt).toMatchObject({
      legId: 40,
      state: 'restored',
      removedRevision: 1,
      restoredRevision: 2,
    });
    expect(mutations).toEqual([
      expect.objectContaining({ operationId: expect.any(String), expectedRevision: 0 }),
      { expectedRevision: 1 },
    ]);
    await expect(page.getByRole('article', { name: 'Transport leg 1' })).toHaveCSS(
      'border-style',
      'solid'
    );
    await page.getByText('Operator, reference and sources', { exact: true }).nth(0).click();
    await expect(page.getByText('Original purchase document', { exact: true })).toHaveAttribute(
      'title',
      'pops:documents/document/42'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    ).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: new URL(`../../../tmp/leg-undo-${width}.png`, import.meta.url).pathname,
      fullPage: true,
    });
  });
}
