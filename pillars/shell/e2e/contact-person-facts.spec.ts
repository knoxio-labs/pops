import { expect, test } from './fixtures/pillar-rest-guard';
import { stubPersonFacts } from './helpers/contact-person-facts';
import { stubContactsApprovedWorkflows } from './helpers/contacts-approved-workflows';

for (const width of [1440, 390]) {
  test(`person facts support direct edits and shared undo at ${width}px`, async ({ page }) => {
    await stubContactsApprovedWorkflows(page);
    await stubPersonFacts(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/contacts/people/person-facts');
    const method = page.getByRole('listitem', { name: 'Contact method 1' });
    await expect(method.getByText('Fictional source')).toBeVisible();
    await method.getByRole('combobox').selectOption('other');
    await method.getByRole('textbox', { name: 'Contact value' }).fill('opaque @custom :text');
    await page.getByRole('textbox', { name: 'City', exact: true }).fill('Unlisted literal city');
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByText('Saved to Contacts.')).toBeVisible();
    await expect(method.getByRole('textbox', { name: 'Contact value' })).toHaveValue(
      'opaque @custom :text'
    );
    await expect(method.getByRole('combobox')).toHaveValue('other');
    await expect(method.getByRole('link')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(method.getByRole('textbox', { name: 'Contact value' })).toHaveValue(
      'Marina@Example.test'
    );
    await expect(page.getByRole('textbox', { name: 'City', exact: true })).toHaveValue('');
    await expect(method.getByText('Fictional source')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    await page.screenshot({ path: `../../tmp/contact-person-facts-${width}.png`, fullPage: true });
  });
}
