import { expect, test } from './fixtures/pillar-rest-guard';
import {
  stubCompanyDetail,
  stubContactCreation,
  stubContactsApprovedWorkflows,
  stubDuplicateReview,
} from './helpers/contacts-approved-workflows';

test('business contact detail leads with methods and addresses', async ({ page }) => {
  await stubContactsApprovedWorkflows(page);
  await stubCompanyDetail(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contacts/entities/org-1');

  const methods = page.getByRole('region', { name: 'Contact methods' });
  await expect(methods).toContainText('hello@harbour.example');
  await expect(page.getByRole('region', { name: 'Addresses' })).toContainText('8 Fiction Lane');
  await expect(page.getByRole('heading', { name: 'Southern Reading Group' })).toBeVisible();
  await page.getByLabel('Contact value').fill('+61 2 5550 0100');
  await page.getByLabel('Label', { exact: true }).fill('Reception');
  await page.getByRole('button', { name: 'Add contact method' }).click();
  await expect(methods).toContainText('+61 2 5550 0100');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '../../tmp/contacts-c03-narrow.png', fullPage: true });
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(390);
});

test('create starts with identity and opens optional contact details', async ({ page }) => {
  await stubContactsApprovedWorkflows(page);
  await stubContactCreation(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/contacts/new');

  await expect(
    page.getByText('Add contact methods and addresses only when you have them.')
  ).toBeVisible();
  await page.getByLabel('Contact name').fill('Northwind Archive');
  await page.getByRole('combobox', { name: 'Contact type' }).selectOption('company');
  await page.getByRole('button', { name: 'Create contact', exact: true }).click();

  await expect(page).toHaveURL(/\/contacts\/entities\/created-company$/);
  await expect(page.getByRole('heading', { name: 'Contact methods' })).toBeVisible();
  await expect(page.getByText('No contact methods yet.')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '../../tmp/contacts-c04-wide.png', fullPage: true });
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(1280);
});

test('duplicate review shows source evidence before explicit merge confirmation', async ({
  page,
}) => {
  await stubContactsApprovedWorkflows(page);
  await stubDuplicateReview(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/contacts/duplicates');

  await page.getByRole('button', { name: 'Choose contact to merge' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Search contacts' });
  await search.fill('Mina Patel');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '../../tmp/contacts-c06-picker-wide.png' });
  await page.getByRole('button', { name: /Mina Patel/ }).click();
  await expect(page.getByText('Fictional address book')).toBeVisible();
  await expect(page.getByText('Mina P. Patel', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Choose contact to keep' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const keepSearch = page.getByRole('textbox', { name: 'Search contacts' });
  await keepSearch.fill('Mina P. Patel');
  await page.evaluate(() => document.fonts.ready);
  const dialogBounds = await page.getByRole('dialog').boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds?.x).toBeGreaterThanOrEqual(-1);
  expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(391);
  const resultBounds = await page.getByRole('button', { name: /Mina P\. Patel/ }).boundingBox();
  expect(resultBounds?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: '../../tmp/contacts-c06-picker-narrow.png' });
  await page.getByRole('button', { name: /Mina P\. Patel/ }).click();
  await page
    .getByRole('textbox', { name: 'Why do these records belong to the same contact?' })
    .fill('Same person, confirmed from the retained address-book record.');
  await expect(page.getByRole('button', { name: 'Preview merge' })).toBeEnabled();
  await page.getByRole('button', { name: 'Preview merge' }).click();
  await expect(page.getByRole('group', { name: 'Merge confirmation' })).toContainText(
    'Merge Mina Patel into Mina P. Patel.'
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '../../tmp/contacts-c05-c06-narrow.png', fullPage: true });
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(390);
});
