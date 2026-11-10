import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';
import { captureWorkspace, stubCaptureWorkspace } from './helpers/trips-capture-workspace';

import type { Locator, Page } from '@playwright/test';

async function bootCapture(page: Page, locale = 'en-AU', retainedContact = false): Promise<void> {
  const resources: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') resources.push(request.url());
  });
  await page.addInitScript((value) => localStorage.setItem('pops-locale', value), locale);
  await stubShellBoot(page, ['trips']);
  await stubCaptureWorkspace(page, retainedContact);
  await page.goto('/trips/71/capture');
  await expect(page.getByRole('textbox', { name: 'Capture text' })).toBeVisible();
  const sourceMode = test.info().project.metadata.remoteMode === 'source';
  expect(resources.filter((url) => url.includes('CapturePage'))).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        sourceMode
          ? /\/trips\/app\/src\/CapturePage\.tsx/
          : /\/trips-ui\/(?:.*\/)?CapturePage-[^/]+\.js(?:\?.*)?$/
      ),
    ])
  );
}

async function navigateCaptureView(
  page: Page,
  view: 'Capture' | 'Inbox' | 'Explore'
): Promise<void> {
  await page.getByRole('link', { name: view, exact: true }).click();
  await expect(page.getByRole('heading', { name: view, exact: true })).toBeVisible();
}

async function openOrganisation(row: Locator): Promise<void> {
  const details = row
    .locator('details')
    .filter({ has: row.page().getByText('Organise', { exact: true }) });
  if ((await details.getAttribute('open')) === null)
    await row.getByText('Organise', { exact: true }).click();
  await expect(details).toHaveJSProperty('open', true);
}

function capturePath(name: string): string {
  const directory = join(process.cwd(), '..', '..', 'tmp', 'trips-capture');
  mkdirSync(directory, { recursive: true });
  return join(
    directory,
    `${test.info().project.metadata.remoteMode === 'source' ? 'source' : 'built'}-${name}`
  );
}

test('keeps organisation controls open when returning to the current Inbox', async ({ page }) => {
  await bootCapture(page);
  await navigateCaptureView(page, 'Inbox');
  const row = page.getByRole('article', { name: 'Capture 701' });
  await openOrganisation(row);
  await navigateCaptureView(page, 'Inbox');
  await expect(row.getByRole('button', { name: 'Choose contact' })).toBeVisible();
  await openOrganisation(row);
  await expect(row.getByRole('button', { name: 'Choose contact' })).toBeVisible();
});

for (const metadataStatus of [404, 503]) {
  test(`reads a retained Contact after metadata ${metadataStatus} through the real owner adapter without replacing source identity`, async ({
    page,
  }) => {
    await bootCapture(page, 'en-AU', true);
    let referenceReads = 0;
    let entityReads = 0;
    const tripsWrites: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/trips-api/') && request.method() !== 'GET')
        tripsWrites.push(request.url());
    });
    await page.route(/\/contacts-api\/entities\/old-id\/reference$/, async (route) => {
      referenceReads += 1;
      await json(route, 200, { canonicalId: 'actual-id', uri: 'pops:contacts/contact/actual-id' });
    });
    await page.route(/\/contacts-api\/entities\/actual-id$/, async (route) => {
      entityReads += 1;
      if (entityReads === 1)
        return json(route, metadataStatus, { error: 'Temporarily unavailable' });
      return json(route, 200, {
        data: {
          id: 'actual-id',
          name: 'Verified owner name',
          type: 'person',
          aliases: [],
          defaultTags: [],
          lastEditedTime: '2026-11-10T00:00:00.000Z',
        },
      });
    });
    await navigateCaptureView(page, 'Inbox');
    const row = page.getByRole('article', { name: 'Capture 701' });
    await openOrganisation(row);
    await expect(row.getByText('Contacts is unavailable.')).toBeVisible();
    await expect(row.getByText('unverified', { exact: true })).toBeVisible();
    await expect(row.getByText('pops:contacts/contact/old-id', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Retry Contact read' }).click();
    await expect(row.getByRole('link', { name: 'Verified owner name' })).toHaveAttribute(
      'href',
      '/contacts/actual-id'
    );
    await expect(row.getByText('organised', { exact: true })).toBeVisible();
    await navigateCaptureView(page, 'Explore');
    await navigateCaptureView(page, 'Capture');
    await navigateCaptureView(page, 'Inbox');
    await expect(row.getByText('organised', { exact: true })).toBeVisible();
    expect(referenceReads).toBe(2);
    expect(entityReads).toBe(2);
    expect(tripsWrites).toEqual([]);
  });
}

test('keeps raw text, distinct selected files, and an accepted Documents task across source views', async ({
  page,
}) => {
  const uploadedBodies: string[] = [];
  let accept = (): void => {
    throw new Error('Upload not started');
  };
  const accepted = new Promise<void>((resolve) => {
    accept = resolve;
  });
  await bootCapture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/\/documents-api\/paperless\/documents(?:\?.*)?$/, async (route) => {
    uploadedBodies.push(route.request().postDataBuffer()?.toString() ?? '');
    if (uploadedBodies.length === 1) await accepted;
    await json(route, 202, { data: { taskId: `capture-upload-${uploadedBodies.length}` } });
  });
  await page
    .getByRole('textbox', { name: 'Capture text' })
    .fill('  Raw trip note 🧭\nsecond line  ');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([
    { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('first bytes') },
    { name: 'same.txt', mimeType: 'text/plain', buffer: Buffer.from('second bytes') },
  ]);
  await page.getByRole('button', { name: 'Send to Documents' }).first().click();
  await expect(page.getByRole('button', { name: 'Sending to Documents…' })).toBeDisabled();
  await navigateCaptureView(page, 'Inbox');
  const source = captureWorkspace.captures[0];
  if (source === undefined) throw new Error('Missing captured source fixture');
  await expect(page.getByText(source.originalText)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Documents task 202' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Upload same.txt' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Sending to Documents…' })).toBeDisabled();
  accept();
  await expect(page.getByRole('button', { name: 'Sending to Documents…' })).toHaveCount(0);
  await navigateCaptureView(page, 'Explore');
  await navigateCaptureView(page, 'Capture');
  await page.getByRole('button', { name: 'Send to Documents' }).click();
  await expect(page.getByText('Documents is processing the upload…').last()).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Capture text' })).toHaveValue(
    '  Raw trip note 🧭\nsecond line  '
  );
  await expect(page.getByRole('region', { name: 'Upload same.txt' })).toHaveCount(2);
  expect(uploadedBodies).toEqual(['first bytes', 'second bytes']);
  await page.screenshot({ path: capturePath('retained-files-wide.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: capturePath('retained-files-narrow.png'), fullPage: true });
});

async function openContactCreation(page: Page): Promise<void> {
  await navigateCaptureView(page, 'Inbox');
  const row = page.getByRole('article', { name: 'Capture 701' });
  await openOrganisation(row);
  await row.getByRole('button', { name: 'Choose contact' }).click();
  await page
    .getByRole('textbox', { name: /Search contacts|Pesquisar contatos/ })
    .fill('Harbour Guide');
  await page.getByRole('button', { name: /Create new|Criar novo/ }).click();
}

test('retains a known-created Contacts entity across navigation without another create', async ({
  page,
}) => {
  let createRequests = 0;
  let referenceRequests = 0;
  let accept = (): void => {
    throw new Error('Creation not started');
  };
  const accepted = new Promise<void>((resolve) => {
    accept = resolve;
  });
  await bootCapture(page);
  await page.route(/\/contacts-api\/entities$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    createRequests += 1;
    await accepted;
    await json(route, 201, {
      data: {
        id: 'contact-1',
        name: 'Harbour Guide',
        type: 'company',
        aliases: [],
        defaultTags: [],
        lastEditedTime: '2026-11-10T00:00:00Z',
      },
      message: 'Created',
    });
  });
  await page.route(/\/contacts-api\/entities\/[^/]+\/reference$/, async (route) => {
    referenceRequests += 1;
    if (referenceRequests === 1) {
      await route.fulfill({ status: 503, body: 'temporary owner failure' });
      return;
    }
    const id = new URL(route.request().url()).pathname.split('/').at(-2) ?? 'contact-1';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ canonicalId: id, uri: `pops:contacts/contact/${id}` }),
    });
  });
  await openContactCreation(page);
  await expect(page.getByRole('textbox', { name: 'Contact name' })).toHaveValue('Harbour Guide');
  await expect(page.getByRole('combobox', { name: 'Contact type' })).toHaveValue('company');
  await expect(page.getByRole('option', { name: 'Company' })).toBeAttached();
  await page.screenshot({ path: capturePath('contact-create-en.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create contact' }).click();
  await expect(page.getByRole('button', { name: 'Create contact' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await navigateCaptureView(page, 'Explore');
  await navigateCaptureView(page, 'Capture');
  accept();
  await navigateCaptureView(page, 'Inbox');
  const row = page.getByRole('article', { name: 'Capture 701' });
  await openOrganisation(row);
  await row.getByRole('button', { name: 'Choose contact' }).click();
  await expect(page.getByRole('button', { name: 'Use created contact' })).toBeVisible();
  await page.getByRole('button', { name: 'Use created contact' }).click();
  await expect(page.getByText('pops:contacts/contact/contact-1')).toBeVisible();
  expect(createRequests).toBe(1);
  expect(referenceRequests).toBe(2);
});

test('uses the owner Portuguese labels and retains an ambiguous create without retrying it', async ({
  page,
}) => {
  let createRequests = 0;
  await bootCapture(page, 'pt-BR');
  await page.route(/\/contacts-api\/entities(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    createRequests += 1;
    await route.abort();
  });
  await openContactCreation(page);
  await expect(page.getByRole('textbox', { name: 'Nome do contato' })).toHaveValue('Harbour Guide');
  await expect(page.getByRole('combobox', { name: 'Tipo de contato' })).toHaveValue('company');
  await expect(page.getByRole('option', { name: 'Empresa' })).toBeAttached();
  await page.screenshot({ path: capturePath('contact-create-pt.png'), fullPage: true });
  await page.getByRole('button', { name: 'Criar contato' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Não foi possível confirmar' })
  ).toContainText('Não foi possível confirmar o resultado da criação');
  await page.keyboard.press('Escape');
  await navigateCaptureView(page, 'Explore');
  await navigateCaptureView(page, 'Inbox');
  const row = page.getByRole('article', { name: 'Capture 701' });
  await openOrganisation(row);
  await row.getByRole('button', { name: 'Choose contact' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'O rascunho foi mantido' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar contato' })).toBeDisabled();
  expect(createRequests).toBe(1);
});
