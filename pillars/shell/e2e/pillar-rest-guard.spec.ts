import { expect, test } from './fixtures/pillar-rest-guard';

const GUARD_PROBE_PATH = '/finance-api/POPS-4033-guard-probe';
const LATE_SCRIPT_PATH = '/pops-4033-late-guard-probe.js';

test.describe('Pillar REST guard', () => {
  test.use({
    allowUnroutedPillarRest: "the guard response is this spec's subject",
  });

  test('catches a request issued by a late script after the test body', async ({
    page,
    context,
  }) => {
    await page.route(/\/pops-4033-guard-page$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>guard probe</h1></body></html>',
      })
    );
    await page.goto('/pops-4033-guard-page');
    await expect(page.getByRole('heading', { name: 'guard probe' })).toBeVisible();

    await context.route(`**${LATE_SCRIPT_PATH}`, async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `fetch('${GUARD_PROBE_PATH}').catch(() => undefined);`,
      });
    });

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const scriptRequest = page.waitForEvent('request', (request) =>
      request.url().endsWith(LATE_SCRIPT_PATH)
    );
    const guardResponse = page.waitForResponse((response) =>
      response.url().endsWith(GUARD_PROBE_PATH)
    );
    await page.evaluate((path) => {
      const script = document.createElement('script');
      script.src = path;
      document.head.append(script);
    }, LATE_SCRIPT_PATH);
    await scriptRequest;
    expect((await guardResponse).status()).toBe(599);
  });
});
