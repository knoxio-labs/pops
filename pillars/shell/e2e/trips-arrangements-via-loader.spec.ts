import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';
import {
  arrangementOwnerReference,
  stubArrangementOwners,
} from './helpers/trips-arrangements-owners';

import type { Page } from '@playwright/test';

const audit = { createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' };
const trip = {
  id: 7,
  name: 'Coast trip',
  destination: '',
  when: '',
  parentId: null,
  tagId: null,
  notes: '',
  sourceLinks: [],
  ...audit,
};
const visits = [
  {
    id: 31,
    tripId: 7,
    placeId: 51,
    revision: 0,
    timing: { arrival: '2030-04-10', departure: '2030-04-13' },
    notes: '',
    sourceLinks: [],
    ...audit,
  },
  {
    id: 32,
    tripId: 7,
    placeId: 51,
    revision: 0,
    timing: { arrival: '2030-04-16', departure: '2030-04-20' },
    notes: '',
    sourceLinks: [],
    ...audit,
  },
];
const stay = {
  id: 13,
  tripId: 7,
  visitId: 31,
  name: 'Cedar guesthouse',
  kind: 'hotel',
  status: 'Reserved',
  timing: { arrival: '2030-04-10', departure: '2030-04-12' },
  address: null,
  reference: null,
  notes: '',
  sourceLinks: [],
  hostLinks: [],
  documentLinks: [],
  ...audit,
};
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
  from: { placeId: 51, sourceLabel: 'Wellington' },
  to: { sourceLabel: 'Harbour' },
  intention: 'In plan',
  arrangement: 'Booked',
  purchase: null,
  operator: null,
  service: null,
  reference: null,
  notes: '',
  sourceLinks: [],
  ...audit,
};

async function stubSources(page: Page) {
  const stayCreates: unknown[] = [];
  const created = {
    ...stay,
    id: 14,
    name: null,
    kind: null,
    status: null,
    timing: { arrival: '2030-04-12', departure: '2030-04-13' },
  };
  const staySources: unknown[] = [stay];
  await stubShellBoot(page, ['trips']);
  const owners = await stubArrangementOwners(page);
  await page.route(/\/trips-api\/places$/, (route) =>
    json(route, 200, { places: [{ id: 51, name: 'Wellington', sourceLinks: [], ...audit }] })
  );
  await page.route(/\/trips-api\/trips\/7$/, (route) => json(route, 200, trip));
  await page.route(/\/trips-api\/trips\/7\/visits$/, (route) => json(route, 200, { visits }));
  await page.route(/\/trips-api\/trips\/7\/stays$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body: unknown = route.request().postDataJSON();
      expect(body).toEqual({
        visitId: 31,
        timing: { arrival: '2030-04-12', departure: '2030-04-13' },
      });
      stayCreates.push(body);
      staySources.push(created);
      await json(route, 201, created);
    } else await json(route, 200, { stays: staySources });
  });
  await page.route(/\/trips-api\/trips\/7\/stays\/14$/, (route) => json(route, 200, created));
  const responsibilityWrites: unknown[] = [];
  let stayAssigned = false;
  const stayResponsibility = () => ({
    tripId: 7,
    targetKind: 'stay',
    targetId: 14,
    responsibility: stayAssigned ? { kind: 'contact', uri: arrangementOwnerReference.uri } : null,
    revision: stayAssigned ? 1 : 0,
  });
  await page.route(/\/trips-api\/trips\/7\/responsibilities\/stay\/14$/, async (route) => {
    if (route.request().method() === 'PUT') {
      const body: unknown = route.request().postDataJSON();
      expect(body).toEqual({
        expectedRevision: 0,
        responsibility: { kind: 'contact', uri: arrangementOwnerReference.uri },
      });
      responsibilityWrites.push(body);
      stayAssigned = true;
    }
    await json(route, 200, stayResponsibility());
  });
  await page.route(/\/trips-api\/trips\/7\/events$/, (route) => json(route, 200, { events: [] }));
  await page.route(/\/trips-api\/trips\/7\/journeys$/, (route) =>
    json(route, 200, { journeys: [journey] })
  );
  await page.route(/\/trips-api\/trips\/7\/journeys\/20\/legs$/, (route) =>
    json(route, 200, { legs: [leg], revision: 0 })
  );
  return {
    stayCreates,
    owners,
    responsibilityWrites,
    responsibilities: () => (stayAssigned ? [stayResponsibility()] : []),
  };
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Along the route editors, owner picker and retained upload at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const writes: { path: string; body: unknown }[] = [];
    let rental = {
      id: 61,
      tripId: 7,
      provider: 'Harbour cars',
      pickupVisitId: 31,
      returnVisitId: 32,
      start: '2030-04-10',
      end: '2030-04-20',
      status: 'Reserved',
      revision: 0,
      ...audit,
    };
    let responsible = true;
    const context = await stubSources(page);
    await page.route(/\/trips-api\/trips\/7\/rentals$/, (route) =>
      json(route, 200, { rentals: [rental] })
    );
    await page.route(/\/trips-api\/trips\/7\/rentals\/61$/, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body: Record<string, unknown> = route.request().postDataJSON();
        writes.push({ path: new URL(route.request().url()).pathname, body });
        expect(body.expectedRevision).toBe(rental.revision);
        if (typeof body.provider !== 'string') throw new Error('Expected an explicit provider');
        expect(body).toMatchObject({
          pickupVisitId: 31,
          returnVisitId: 32,
          start: '2030-04-10',
          end: '2030-04-20',
          status: 'Reserved',
        });
        rental = { ...rental, provider: body.provider, revision: rental.revision + 1 };
      }
      await json(route, 200, rental);
    });
    const responsibility = () => ({
      tripId: 7,
      targetKind: 'rental',
      targetId: 61,
      revision: responsible ? 4 : 5,
      responsibility: responsible
        ? { kind: 'contact', uri: 'pops:contacts/contact/retained-unavailable' }
        : null,
    });
    await page.route(/\/trips-api\/trips\/7\/responsibilities$/, (route) =>
      json(route, 200, { responsibilities: [responsibility(), ...context.responsibilities()] })
    );
    await page.route(/\/trips-api\/trips\/7\/responsibilities\/rental\/61$/, async (route) => {
      if (route.request().method() === 'PUT') {
        const body: unknown = route.request().postDataJSON();
        writes.push({ path: new URL(route.request().url()).pathname, body });
        expect(body).toEqual({ responsibility: null, expectedRevision: 4 });
        responsible = false;
      }
      await json(route, 200, responsibility());
    });
    await page.goto('/trips/7/arrangements');
    await expect(page.getByRole('heading', { name: 'Arrangements', exact: true })).toBeVisible();
    const rentalCard = page.getByRole('article', { name: 'Harbour cars' });
    await expect(rentalCard).toHaveCount(1);
    await expect(
      page
        .getByRole('region', { name: 'Wellington · Visit 1' })
        .getByRole('article', { name: 'Harbour cars' })
    ).toBeVisible();
    await expect(rentalCard.getByText('Wellington · Visit 2', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Journeys' })
        .getByRole('article', { name: 'Harbour connection' })
    ).toBeVisible();
    await expect(rentalCard.getByRole('button')).toHaveCSS('border-style', 'dashed');
    const layout = await page
      .getByRole('main')
      .last()
      .evaluate((element) => {
        const parent = element.parentElement;
        if (!parent) throw new Error('Expected the shell workspace host');
        const styles = getComputedStyle(parent);
        const available =
          parent.clientWidth -
          Number.parseFloat(styles.paddingLeft) -
          Number.parseFloat(styles.paddingRight);
        return {
          actual: element.getBoundingClientRect().width,
          expected: Math.min(available, Number.parseFloat(getComputedStyle(element).maxWidth)),
        };
      });
    expect(layout.actual).toBeCloseTo(layout.expected, 0);
    const open = rentalCard.getByRole('button');
    const bounds = await open.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: new URL(`../../../tmp/arrangements-shell-${viewport.width}.png`, import.meta.url)
        .pathname,
      fullPage: true,
    });
    await open.click();
    await expect(page.getByLabel('Provider', { exact: true })).toHaveValue('Harbour cars');
    await expect(page.getByRole('region', { name: 'Add files', exact: true })).toHaveCount(0);
    await page.getByLabel('Provider', { exact: true }).fill('Updated provider');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Provider', { exact: true })).toHaveValue('Harbour cars');
    await page.getByRole('button', { name: 'Clear responsibility', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Handled by', exact: true })
        .getByText('Unset', { exact: true })
    ).toBeVisible();
    for (const control of [
      page.getByLabel('Provider', { exact: true }),
      page.getByLabel('Pickup', { exact: true }),
      page.getByRole('button', { name: 'Save changes', exact: true }),
      page.getByRole('button', { name: 'Self', exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const gap = page
      .getByRole('region', { name: 'Wellington · Visit 1' })
      .getByRole('button', { name: /Accommodation not arranged/ });
    const gapBounds = await gap.boundingBox();
    expect(gapBounds?.height).toBeGreaterThanOrEqual(44);
    expect(gapBounds?.width).toBeGreaterThanOrEqual(44);
    await gap.click();
    await expect(page.getByLabel('Stay name', { exact: true })).toHaveValue('');
    await expect(page.getByRole('dialog').getByLabel('Check-in date', { exact: true })).toHaveValue(
      '2030-04-12'
    );
    await expect(
      page.getByRole('dialog').getByLabel('Check-out date', { exact: true })
    ).toHaveValue('2030-04-13');
    const handledBy = page.getByRole('region', { name: 'Handled by', exact: true });
    await handledBy.getByRole('button', { name: 'Choose contact', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a contact', exact: true });
    await picker.getByRole('textbox', { name: 'Search contacts', exact: true }).fill('Owner');
    await picker.getByRole('button', { name: /Owner from Contacts/ }).click();
    await expect(
      handledBy.getByRole('link', { name: 'Owner from Contacts', exact: true })
    ).toHaveAttribute('href', '/contacts/owner-issued');
    expect(context.owners.contactCreates).toEqual([]);
    expect(context.responsibilityWrites).toEqual([
      {
        expectedRevision: 0,
        responsibility: { kind: 'contact', uri: arrangementOwnerReference.uri },
      },
    ]);
    await handledBy.getByRole('button', { name: 'Choose contact', exact: true }).click();
    await picker.getByRole('textbox', { name: 'Search contacts', exact: true }).fill('New driver');
    await picker.getByRole('button', { name: 'Create new', exact: true }).click();
    const creation = page.getByRole('dialog', { name: 'Create contact', exact: true });
    await expect(creation.getByRole('textbox')).toHaveValue('New driver');
    await expect(creation.getByRole('combobox', { name: 'Contact type', exact: true })).toHaveValue(
      'company'
    );
    await creation.getByRole('button', { name: 'Create contact', exact: true }).click();
    await expect(creation.getByText(/create outcome is unknown/)).toBeVisible();
    await creation.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const createdStay = page
      .locator('[data-source-kind="stay"][data-source-id="14"]')
      .getByRole('button');
    await createdStay.click();
    await handledBy.getByRole('button', { name: 'Choose contact', exact: true }).click();
    await expect(creation.getByRole('textbox')).toHaveValue('New driver');
    await expect(
      creation.getByRole('button', { name: 'Create contact', exact: true })
    ).toBeDisabled();
    expect(context.owners.contactCreates).toHaveLength(1);
    expect(context.responsibilityWrites).toHaveLength(1);
    await creation.getByRole('button', { name: 'Close', exact: true }).click();
    const addFiles = page.getByRole('region', { name: 'Add files', exact: true });
    await expect(addFiles.getByRole('button', { name: /^Upload a file/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await addFiles.locator('input[type="file"]').setInputFiles({
      name: 'booking.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('original booking'),
    });
    await page.getByRole('button', { name: 'Send to Documents', exact: true }).click();
    await context.owners.uploadStarted;
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    context.owners.acceptUpload();
    await createdStay.click();
    await expect(page.getByText(/booking.pdf ·/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Retry status check', exact: true })
    ).toBeVisible();
    expect(context.owners.uploadCount()).toBe(1);
    context.owners.completeTask();
    await page.getByRole('button', { name: 'Retry status check', exact: true }).click();
    await page.getByRole('button', { name: 'Link file', exact: true }).click();
    await expect(page.getByText('Booking original', { exact: true })).toBeVisible();
    const overflowingFields = await page
      .getByRole('article', { name: 'Stay editor', exact: true })
      .evaluate((element) => {
        const boundary = element.getBoundingClientRect();
        return [
          ...element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input, select, textarea'
          ),
        ]
          .map((field) => ({
            field: [...(field.labels ?? [])].map((label) => label.textContent).join(' '),
            type: field.getAttribute('type'),
            width: field.getBoundingClientRect().width,
            right: field.getBoundingClientRect().right,
          }))
          .filter((field) => field.width > 0 && field.right > boundary.right);
      });
    expect(overflowingFields).toEqual([]);
    const dialogWidth = await page.getByRole('dialog').evaluate((element) => ({
      content: element.scrollWidth,
      viewport: element.clientWidth,
    }));
    expect(dialogWidth.content).toBeLessThanOrEqual(dialogWidth.viewport);
    await page
      .getByRole('dialog')
      .getByLabel('Check-in date', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: new URL(`../../../tmp/arrangements-source-${viewport.width}.png`, import.meta.url)
        .pathname,
      fullPage: true,
    });
    expect(context.owners.associations).toHaveLength(1);
    expect(context.owners.uploadCount()).toBe(1);
    expect(context.owners.taskReads.every((url) => url.endsWith('/arrangement-upload-1'))).toBe(
      true
    );
    expect(context.stayCreates).toEqual([
      { visitId: 31, timing: { arrival: '2030-04-12', departure: '2030-04-13' } },
    ]);
    expect(writes.map((write) => write.path)).toEqual([
      '/trips-api/trips/7/rentals/61',
      '/trips-api/trips/7/rentals/61',
      '/trips-api/trips/7/responsibilities/rental/61',
    ]);
    expect(writes[0]?.body).toMatchObject({ expectedRevision: 0, provider: 'Updated provider' });
    expect(writes[1]?.body).toMatchObject({ expectedRevision: 1, provider: 'Harbour cars' });
    expect(errors).toEqual([]);
  });
}
