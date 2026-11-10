import { expect, test } from './fixtures/pillar-rest-guard';
import { json, stubShellBoot } from './helpers/pillar-rest';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Decision remote source selection and identity-preserving Undo at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const audit = { createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' };
    let decision = {
      id: 8,
      tripId: 7,
      question: 'Which departure works best?',
      deadline: null,
      notes: '',
      sourceLinks: [],
      selectedOptionId: null as number | null,
      revision: 0,
      ...audit,
    };
    const option = {
      id: 9,
      decisionId: 8,
      title: 'Morning train',
      notes: 'Keep the afternoon free',
      affectedSources: [{ kind: 'journey', id: 24 }],
      sourceLinks: [],
      ...audit,
    };
    let options = [option];
    const errors: string[] = [];
    const writes: { method: string; path: string; body: unknown }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await stubShellBoot(page, ['trips']);
    await page.route(/\/trips-api\/places$/, (route) => json(route, 200, { places: [] }));
    for (const kind of ['visits', 'stays', 'journeys'])
      await page.route(new RegExp(`/trips-api/trips/7/${kind}$`, 'u'), (route) =>
        json(route, 200, { [kind]: [] })
      );
    await page.route(/\/trips-api\/trips\/7\/decisions\/8\/workspace$/, (route) =>
      json(route, 200, { decision, options })
    );
    await page.route(
      /\/trips-api\/trips\/7\/decisions\/8\/(?:selection|options\/9(?:\/restore)?)$/,
      async (route) => {
        const request = route.request();
        const body: Record<string, unknown> = request.postDataJSON();
        const path = new URL(request.url()).pathname;
        writes.push({ method: request.method(), path, body });
        if (body.expectedRevision !== decision.revision) {
          await json(route, 409, {
            code: 'trips.decision.decision_revision_conflict',
            message: 'Revision changed',
            retryable: false,
          });
          return;
        }
        if (path.endsWith('/selection')) {
          if (body.optionId !== null && body.optionId !== option.id)
            throw new Error('Unexpected option identity');
          decision = {
            ...decision,
            selectedOptionId: body.optionId,
            revision: decision.revision + 1,
          };
          await json(route, 200, decision);
        } else if (request.method() === 'DELETE') {
          options = [];
          decision = { ...decision, selectedOptionId: null, revision: decision.revision + 1 };
          await route.fulfill({ status: 204 });
        } else {
          expect(body.select).toBe(true);
          options = [option];
          decision = { ...decision, selectedOptionId: option.id, revision: decision.revision + 1 };
          await json(route, 200, option);
        }
      }
    );
    await page.goto('/trips/7/decisions/8');
    await expect(page.getByRole('heading', { name: 'Decision', exact: true })).toBeVisible();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue(decision.question);
    await expect(page.locator('link[href*="/trips-ui/trips.css"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Choose Option 1', exact: true }).click();
    await expect(page.getByText('Decided', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reopen', exact: true }).click();
    await expect(page.getByText('Open', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Decided', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Option 1', exact: true }).click();
    await expect(page.getByText('No options recorded', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByLabel('Option 1 name', { exact: true })).toHaveValue('Morning train');
    await expect(page.getByText('Decided', { exact: true })).toBeVisible();
    expect(writes.map((write) => write.body)).toEqual([
      { optionId: 9, expectedRevision: 0 },
      { optionId: null, expectedRevision: 1 },
      { optionId: 9, expectedRevision: 2 },
      { expectedRevision: 3 },
      { select: true, expectedRevision: 4 },
    ]);
    expect(writes.map((write) => write.path)).toEqual([
      '/trips-api/trips/7/decisions/8/selection',
      '/trips-api/trips/7/decisions/8/selection',
      '/trips-api/trips/7/decisions/8/selection',
      '/trips-api/trips/7/decisions/8/options/9',
      '/trips-api/trips/7/decisions/8/options/9/restore',
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);
    const layout = await page
      .getByRole('main')
      .last()
      .evaluate((element) => {
        const parent = element.parentElement;
        if (!parent) throw new Error('Workspace has no shell host');
        const host = getComputedStyle(parent);
        const available =
          parent.clientWidth -
          Number.parseFloat(host.paddingLeft) -
          Number.parseFloat(host.paddingRight);
        return {
          width: element.getBoundingClientRect().width,
          expected: Math.min(available, Number.parseFloat(getComputedStyle(element).maxWidth)),
        };
      });
    expect(layout.width).toBeCloseTo(layout.expected, 0);
    await page.screenshot({
      path: `../../tmp/decision-shell-${viewport.width}.png`,
      fullPage: true,
    });
    await page.goto('/trips/nope/decisions/8');
    await expect(page.getByText('Choose a valid trip and decision', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
