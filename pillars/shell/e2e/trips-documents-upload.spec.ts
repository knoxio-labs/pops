import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';
import { stubDurableUploadOwner } from './helpers/trips-durable-uploads';

const associationUrl = /\/trips-api\/trips\/71\/document-associations$/;
const policy = {
  configured: true,
  available: true,
  baseUrl: 'https://paperless.example',
  documentCount: 4,
  maxUploadBytes: 1000,
  allowedMimeTypes: ['application/pdf'],
};

function capturePath(name: string): string {
  const directory = join(process.cwd(), '..', '..', 'tmp', 'trips-documents');
  mkdirSync(directory, { recursive: true });
  return join(directory, name);
}

test('Trips Documents uploads, retries a rejected file, resolves the owner task and attaches the original', async ({
  page,
}) => {
  let associations: Array<Record<string, unknown>> = [];
  let taskRequests = 0;
  let uploadRequests = 0;
  await stubShellBoot(page, ['trips']);
  await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
  await page.route(/\/trips-api\/trips\/71\/visits$/, (route) => json(route, 200, { visits: [] }));
  await page.route(/\/trips-api\/trips\/71\/stays$/, (route) => json(route, 200, { stays: [] }));
  await page.route(/\/trips-api\/trips\/71\/events$/, (route) => json(route, 200, { events: [] }));
  await page.route(/\/trips-api\/trips\/71\/journeys$/, (route) =>
    json(route, 200, { journeys: [] })
  );
  await page.route(associationUrl, async (route) => {
    if (route.request().method() === 'POST') {
      const body: { documentId: number; targetKind: string; targetId: number } = route
        .request()
        .postDataJSON();
      associations = [
        {
          id: 1,
          tripId: 71,
          documentId: body.documentId,
          targetKind: body.targetKind,
          targetId: body.targetId,
          createdAt: '2026-11-10T00:00:00Z',
        },
      ];
      await json(route, 201, associations[0]);
    } else await json(route, 200, { associations });
  });
  await page.route(/\/documents-api\/paperless\/status$/, (route) =>
    json(route, 200, { data: policy })
  );
  await stubDurableUploadOwner(page, {
    admit: () => {
      uploadRequests += 1;
      return uploadRequests === 1 ? 'rejected_71' : 'task_71';
    },
    content: (_input, bytes) => {
      expect(bytes.toString()).toBe('booking');
    },
    read: (_input, taskId) => {
      if (taskId === 'rejected_71') return { state: 'failed', reason: 'Unsupported file type' };
      taskRequests += 1;
      return taskRequests === 1 ? { state: 'pending' } : { state: 'done', documentId: 711 };
    },
  });
  await page.route(/\/documents-api\/paperless\/documents\/711$/, (route) =>
    json(route, 200, {
      data: {
        id: 711,
        title: 'Harbour booking',
        created: '2026-11-10',
        originalFileName: 'booking.pdf',
        thumbnailUrl: '',
      },
    })
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/trips/71/documents');
  await expect(page.getByRole('button', { name: /^Upload a file/ })).toHaveAttribute(
    'aria-disabled',
    'false'
  );
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: 'booking.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('booking'),
  });
  await page.getByRole('button', { name: 'Send to Documents' }).click();
  await expect(
    page.getByText('Documents could not accept this file: Unsupported file type', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await page.screenshot({ path: capturePath('upload-error-wide.png'), fullPage: true });
  await page.getByRole('button', { name: 'Remove booking.pdf' }).click();
  await input.setInputFiles({
    name: 'booking.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('booking'),
  });
  await page.getByRole('button', { name: 'Send to Documents' }).click();
  await expect(
    page.getByText('Upload accepted. Waiting for the owner to verify its original identity…', {
      exact: true,
    })
  ).toBeVisible();
  await page.screenshot({ path: capturePath('upload-pending-wide.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Link file' })).toBeVisible();
  await page.getByRole('button', { name: 'Link file' }).click();
  await expect(page.getByRole('heading', { name: 'Trip documents' })).toBeVisible();
  await expect(
    page.getByText('Documents could not accept this file: Unsupported file type', { exact: true })
  ).toHaveCount(0);
  await expect(page.getByText('booking.pdf', { exact: true })).toBeVisible();
  const originalLink = page.getByRole('link', { name: 'Open original' });
  const unlinkButton = page.getByRole('button', { name: 'Unlink Harbour booking' });
  expect((await originalLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await unlinkButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: capturePath('upload-linked-wide.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('booking.pdf', { exact: true })).toBeVisible();
  await page.screenshot({ path: capturePath('upload-linked-narrow.png'), fullPage: true });
  expect(uploadRequests).toBe(2);
  expect(taskRequests).toBeGreaterThanOrEqual(2);
  expect(associations).toHaveLength(1);
});

test('multiple same-name files keep independent owner tasks beside explicit route groups', async ({
  page,
}) => {
  let uploadRequests = 0;
  let contentRequests = 0;
  const taskRequests = new Set<string>();
  const associations = [
    { id: 1, tripId: 71, documentId: 711, targetKind: 'trip', targetId: 71, createdAt: '' },
    { id: 2, tripId: 71, documentId: 712, targetKind: 'visit', targetId: 8, createdAt: '' },
    { id: 3, tripId: 71, documentId: 713, targetKind: 'stay', targetId: 4, createdAt: '' },
    { id: 4, tripId: 71, documentId: 714, targetKind: 'event', targetId: 5, createdAt: '' },
    { id: 5, tripId: 71, documentId: 715, targetKind: 'journey', targetId: 6, createdAt: '' },
  ];
  await stubShellBoot(page, ['trips']);
  await page.route(/\/trips-api\/places$/, (route) =>
    json(route, 200, { places: [{ id: 1, name: 'Porto' }] })
  );
  await page.route(/\/trips-api\/trips\/71\/visits$/, (route) =>
    json(route, 200, { visits: [{ id: 8, placeId: 1 }] })
  );
  await page.route(/\/trips-api\/trips\/71\/stays$/, (route) =>
    json(route, 200, { stays: [{ id: 4, name: 'Harbour hotel', visitId: 8 }] })
  );
  await page.route(/\/trips-api\/trips\/71\/events$/, (route) =>
    json(route, 200, { events: [{ id: 5, name: 'Museum', visitId: 8 }] })
  );
  await page.route(/\/trips-api\/trips\/71\/journeys$/, (route) =>
    json(route, 200, { journeys: [{ id: 6, name: 'Independent rail' }] })
  );
  await page.route(associationUrl, async (route) => {
    if (route.request().method() === 'POST') {
      const body: { documentId: number; targetKind: string; targetId: number } = route
        .request()
        .postDataJSON();
      const association = { ...body, id: associations.length + 1, tripId: 71, createdAt: '' };
      associations.push(association);
      await json(route, 201, association);
    } else await json(route, 200, { associations });
  });
  await page.route(/\/documents-api\/paperless\/status$/, (route) =>
    json(route, 200, {
      data: { ...policy, allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'] },
    })
  );
  await stubDurableUploadOwner(page, {
    admit: () => {
      uploadRequests += 1;
      return `task_${String(uploadRequests)}`;
    },
    content: (_input, bytes) => {
      expect(bytes.toString()).toBe(['first', 'other', 'replacement'][contentRequests]);
      contentRequests += 1;
    },
    read: (_input, taskId) => {
      taskRequests.add(taskId);
      if (taskId === 'task_2') return { state: 'failed', reason: 'Unsupported file type' };
      return { state: 'done', documentId: taskId === 'task_1' ? 721 : 723 };
    },
  });
  await page.route(/\/documents-api\/paperless\/documents\/7[0-9]+$/, (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    return json(route, 200, {
      data: {
        id,
        title: `Original ${String(id)}`,
        originalFileName: 'booking.pdf',
        created: '2026-11-10',
        thumbnailUrl: '',
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/trips/71/documents');
  const uploadEntry = page.getByRole('button', { name: 'Upload a file' });
  await expect(uploadEntry).toHaveAttribute('aria-disabled', 'false');
  const picker = page.getByRole('button', { name: 'Choose existing document' });
  expect((await picker.boundingBox())?.width).toBe(128);
  expect((await picker.boundingBox())?.height).toBe(128);
  await expect(page.getByRole('region', { name: 'Porto', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Stay · Harbour hotel' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Event · Museum' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Journey · Independent rail' })).toBeVisible();
  const visit = page.getByRole('region', { name: 'Porto', exact: true });
  await expect(visit.getByRole('heading', { level: 3 })).toHaveText([
    'Visit documents',
    'Stay · Harbour hotel',
    'Event · Museum',
  ]);
  await expect(
    page.getByRole('heading', { name: 'Journey · Independent rail', level: 2 })
  ).toBeVisible();
  await expect(visit.getByRole('region', { name: 'Journey · Independent rail' })).toHaveCount(0);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles([
    { name: 'same.pdf', mimeType: 'application/pdf', buffer: Buffer.from('first') },
    { name: 'same.pdf', mimeType: 'application/pdf', buffer: Buffer.from('other') },
  ]);
  const rows = page.getByRole('article', { name: 'Selected file same.pdf' });
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByRole('button', { name: 'Send to Documents' }).click();
  await rows.nth(1).getByRole('button', { name: 'Send to Documents' }).click();
  await expect(rows.nth(0).getByRole('button', { name: 'Link file' })).toBeVisible();
  await expect(
    rows
      .nth(1)
      .getByText('Documents could not accept this file: Unsupported file type', { exact: true })
  ).toBeVisible();
  await page.screenshot({ path: capturePath('queue-wide.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: capturePath('queue-narrow.png'), fullPage: true });
  await rows.nth(1).getByRole('button', { name: 'Remove same.pdf' }).click();
  await input.setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: Buffer.from('replacement'),
  });
  await page
    .getByRole('article', { name: 'Selected file replacement.png' })
    .getByRole('button', { name: 'Send to Documents' })
    .click();
  await page
    .getByRole('article', { name: 'Selected file same.pdf' })
    .getByRole('button', { name: 'Link file' })
    .click();
  await page
    .getByRole('article', { name: 'Selected file replacement.png' })
    .getByRole('button', { name: 'Link file' })
    .click();
  await expect(page.getByRole('button', { name: 'Unlink Original 721' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlink Original 723' })).toBeVisible();
  expect(uploadRequests).toBe(3);
  expect(contentRequests).toBe(3);
  expect([...taskRequests].toSorted()).toEqual(['task_1', 'task_2', 'task_3']);
  await page.screenshot({ path: capturePath('route-groups-narrow.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: capturePath('route-groups-wide.png'), fullPage: true });
});
