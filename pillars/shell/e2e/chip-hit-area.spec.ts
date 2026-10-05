import { expect, test } from './fixtures/pillar-rest-guard';

test.describe('Chip remove hit areas', () => {
  test('wrapped values have separate remove targets at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/iframe.html?id=inputs-chips--wrapped-removable-values&viewMode=story');

    const values = page.getByLabel('Current values');
    const initialValues = 'alpha, bravo, charlie, delta, echo';
    await expect(values).toHaveText(initialValues);

    const buttons = await page.getByRole('button', { name: 'Remove' }).all();
    expect(buttons).toHaveLength(5);
    const positionedButtons = await Promise.all(
      buttons.map(async (button) => ({ button, box: await button.boundingBox() }))
    );
    const boxes = positionedButtons.flatMap(({ button, box }) => (box ? [{ button, ...box }] : []));
    expect(boxes).toHaveLength(5);

    const rowTops = [...new Set(boxes.map(({ y }) => Math.round(y)))].sort(
      (first, second) => first - second
    );
    expect(rowTops.length).toBeGreaterThan(1);

    const firstRow = boxes.filter(({ y }) => Math.round(y) === rowTops[0]);
    const secondRow = boxes.filter(({ y }) => Math.round(y) === rowTops[1]);
    const first = firstRow[0];
    const second = secondRow[0];
    if (first === undefined || second === undefined) {
      throw new Error('Expected removable chips in both wrapped rows.');
    }

    const horizontalDistance = Math.abs(first.x + first.width / 2 - (second.x + second.width / 2));
    expect(horizontalDistance).toBeLessThan(46);

    await page.mouse.click(
      (first.x + first.width / 2 + second.x + second.width / 2) / 2,
      (first.y + first.height / 2 + second.y + second.height / 2) / 2
    );

    await expect(values).toHaveText(initialValues);
  });

  test('a clickable chip label edge does not trigger removal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/iframe.html?id=data-display-chip--removable-clickable&viewMode=story');

    const label = page.getByText('Clickable tag', { exact: true });
    const labelBox = await label.boundingBox();
    if (labelBox === null) throw new Error('Expected the clickable chip label to be visible.');
    await page.mouse.click(labelBox.x + labelBox.width - 1, labelBox.y + labelBox.height / 2);

    await expect(page.getByLabel('Chip click count')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Remove clickable tag' })).toBeVisible();
  });
});
