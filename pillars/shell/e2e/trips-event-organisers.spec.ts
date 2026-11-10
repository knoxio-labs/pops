import { expect, test } from './fixtures/pillar-rest-guard';
import { stubEventOrganiserOwners } from './helpers/trips-event-organisers';

for (const width of [1440, 390]) {
  test(`Event organiser retains owner creation and source retry independently at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const owner = await stubEventOrganiserOwners(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/trips/7/events/19');
    await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('Source performance');
    await expect(page.getByLabel('Organiser references URI')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add organiser', exact: true }).click();
    await page.getByLabel('Search contacts', { exact: true }).fill('New source organiser');
    await page.getByRole('button', { name: 'Create new', exact: true }).click();
    await expect(page.getByLabel('Contact name', { exact: true })).toHaveValue(
      'New source organiser'
    );
    await page.getByRole('button', { name: 'Create contact', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Use created contact', exact: true })
    ).toBeVisible();
    await expect(page.getByLabel('Contact name', { exact: true })).toBeDisabled();
    expect(owner.created()).toBe(1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add organiser', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Use created contact', exact: true })
    ).toBeVisible();
    owner.allowReference();
    await page.getByRole('button', { name: 'Use created contact', exact: true }).click();
    await expect(page.getByText('Changes have not been saved', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'New source organiser', exact: true })
    ).toHaveAttribute('href', '/contacts/owner-organiser');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    expect(owner.writes).toEqual([
      { organiserLinks: [{ uri: owner.reference.uri }] },
      { organiserLinks: [{ uri: owner.reference.uri }] },
    ]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove organiser 1', exact: true })).toHaveCount(
      0
    );
    expect(owner.created()).toBe(1);
    expect(owner.writes).toHaveLength(3);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
