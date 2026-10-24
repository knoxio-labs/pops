import { expect, test } from './fixtures/pillar-rest-guard';
import { stubContactsReview } from './helpers/contacts-review';

test('long contact names stay inside their queue buttons on mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await stubContactsReview(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contacts/imports/layout-batch');
  const queue = page.getByRole('navigation', { name: 'Incoming contact queue' });
  const rows = queue.locator(':scope > button');
  await expect(rows).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  const overflowing = await rows.evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const bounds = button.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        return Array.from(range.getClientRects()).some(
          (rect) => rect.left < bounds.left || rect.right > bounds.right
        );
      })
      .map((button) => button.textContent)
  );
  expect(overflowing).toEqual([]);
  expect(errors).toEqual([]);
});
