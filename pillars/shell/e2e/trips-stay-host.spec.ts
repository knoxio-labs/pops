import { expect, test } from './fixtures/pillar-rest-guard';
import { stubSourceContactOwners } from './helpers/trips-event-organisers';

for (const width of [1440, 390]) {
  test(`Stay Host retains owner creation and source retry independently at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const owner = await stubSourceContactOwners(page, 'stay');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/trips/7/stays/13');
    await expect(page.getByLabel('Stay name', { exact: true })).toHaveValue('Source guesthouse');
    await expect(page.getByText('No links recorded', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose host', exact: true }).click();
    await page.getByLabel('Search contacts', { exact: true }).fill('New source contact');
    await page.getByRole('button', { name: 'Create new', exact: true }).click();
    await page.getByRole('button', { name: 'Create contact', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Use created contact', exact: true })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Choose host', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Use created contact', exact: true })
    ).toBeVisible();
    owner.allowReference();
    await page.getByRole('button', { name: 'Use created contact', exact: true }).click();
    await expect(page.getByText('Changes have not been saved', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'New source contact', exact: true })
    ).toHaveAttribute('href', '/contacts/owner-organiser');
    await expect(page.getByLabel('Address', { exact: true })).toHaveValue('18 Source Lane');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    expect(owner.writes).toEqual([
      { hostLinks: [{ uri: owner.reference.uri }] },
      { hostLinks: [{ uri: owner.reference.uri }] },
    ]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove host link 1', exact: true })).toHaveCount(
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
