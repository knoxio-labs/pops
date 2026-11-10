import { expect, test } from './fixtures/pillar-rest-guard';
import { stubTripPeople } from './helpers/trips-people';

test('People reads canonical Contacts through the real host and preserves exact repeated-town Visit choices', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const source = await stubTripPeople(page);
  await page.goto('/trips/7/people');
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  const card = page.getByRole('article', { name: 'Coffee', exact: true });
  await expect(card.getByText('Casey Park', { exact: true })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open Contact' })).toHaveAttribute(
    'href',
    '/contacts/canonical'
  );
  expect(source.canonicalReads()).toBeGreaterThan(0);
  await card.getByRole('combobox', { name: 'Visit', exact: true }).selectOption('2');
  await expect(
    page.getByRole('heading', { name: '2. Wellington · #2', exact: true })
  ).toBeVisible();
  await expect(card.getByRole('combobox', { name: 'Agreement', exact: true })).toBeEnabled();
  await card.getByRole('combobox', { name: 'Agreement', exact: true }).selectOption('Agreed');
  await expect(card.getByRole('combobox', { name: 'Agreement', exact: true })).toHaveValue(
    'Agreed'
  );
  await expect(card.getByRole('combobox', { name: 'Intention', exact: true })).toHaveValue(
    'Considering'
  );
  expect(source.writes).toEqual([
    expect.objectContaining({
      command: { kind: 'update', id: 41, expectedRevision: 1, patch: { visitId: 2 } },
    }),
    expect.objectContaining({
      command: { kind: 'update', id: 41, expectedRevision: 2, patch: { agreement: 'Agreed' } },
    }),
  ]);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `../../tmp/people-${testInfo.project.name}.png`, fullPage: true });
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  expect(errors).toEqual([]);
});

test('People retains the actual owner creation draft and unknown outcome across close and route remount', async ({
  page,
}) => {
  const source = await stubTripPeople(page);
  source.failCreate();
  await page.goto('/trips/7/people');
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search contacts', exact: true }).fill('Retained person');
  await page.getByRole('button', { name: 'Create new', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Contact name', exact: true })).toHaveValue(
    'Retained person'
  );
  await page.getByRole('button', { name: 'Create contact', exact: true }).click();
  await expect(page.getByText(/The create outcome is unknown/)).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Contact name', exact: true })).toHaveValue(
    'Retained person'
  );
  await expect(page.getByRole('button', { name: 'Create contact', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/trips/7/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('textbox', { name: 'Destination', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/trips/7/people');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Contact name', exact: true })).toHaveValue(
    'Retained person'
  );
  await expect(page.getByRole('button', { name: 'Create contact', exact: true })).toBeDisabled();
  expect(source.creates()).toBe(1);
  expect(source.writes).toEqual([]);
});
