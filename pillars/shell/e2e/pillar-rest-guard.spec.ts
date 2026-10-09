import { expect, test } from './fixtures/pillar-rest-guard';

test.describe('Pillar REST guard', () => {
  test.use({
    expectedUnroutedPillarRestCalls: [
      { method: 'GET', pathAndQuery: '/finance-api/__e2e__/late-request' },
    ],
  });

  test('catches a late request after page routes are cleared', async ({ page }) => {
    await page.route('**/__e2e__/rest-guard', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      })
    );
    await page.goto('/__e2e__/rest-guard');

    await page.route('**/finance-api/__e2e__/stubbed', (route) => route.fulfill({ status: 204 }));
    const stubbedStatus = await page.evaluate(
      async () => (await fetch('/finance-api/__e2e__/stubbed')).status
    );
    expect(stubbedStatus).toBe(204);

    await page.unrouteAll();

    const lateResponse = await page.evaluate(async () => {
      const response = await fetch('/finance-api/__e2e__/late-request');
      return { status: response.status, body: await response.json() };
    });
    expect(lateResponse.status).toBe(599);
    expect(lateResponse.body).toMatchObject({ error: 'unstubbed-pillar-rest-call' });
  });
});
