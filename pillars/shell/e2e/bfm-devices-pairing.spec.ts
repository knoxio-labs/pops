/**
 * bfm Devices — mint a pairing code, see the paired handset, revoke it.
 *
 * Self-contained by design. The rest of this suite routes through
 * `helpers/use-real-api`, which targets the deleted tRPC monolith's seeded
 * `e2e` environment and is why the whole suite is gated to
 * `workflow_dispatch` (POPS-1311). This spec fulfils bfm's three operator
 * routes at the `/bfm-api` proxy path instead, so it depends on nothing that
 * rewrite has to replace and will run unchanged the day the harness comes
 * back.
 *
 * bfm itself does not need to be up. What is under test is the page: that it
 * asks for a code, renders what came back, lists what is paired, and cuts a
 * device off only after the operator confirms.
 */
import { expect, test, type Page, type Route } from '@playwright/test';

const PAIRING_CODE = '7QK4-9M2X-P3ND';
const PAIRING_URL = `https://bfm.example.test/devices/pair?code=${PAIRING_CODE}`;

const TRUSTED_DEVICE = {
  id: 'dev-e2e-1',
  name: "Joao's iPhone",
  model: 'iPhone 17 Pro',
  createdAt: '2026-08-01T10:00:00.000Z',
  lastSeenAt: '2026-08-08T09:00:00.000Z',
  revokedAt: null,
};

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Stand in for bfm's operator surface.
 *
 * `revokedAt` is held in a closure rather than hardcoded per-response so the
 * list genuinely reflects the revocation the test performed — a fixture that
 * always answered "revoked" would pass whether or not the DELETE ever fired.
 */
async function stubOperatorApi(
  page: Page,
  options: { ttlSeconds?: number; revokeStatus?: number } = {}
): Promise<void> {
  const ttlSeconds = options.ttlSeconds ?? 300;
  let revokedAt: string | null = null;

  await page.route('**/bfm-api/operator/pairing/codes', (route) =>
    json(route, 201, {
      code: PAIRING_CODE,
      pairingUrl: PAIRING_URL,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    })
  );

  await page.route('**/bfm-api/operator/devices', (route) =>
    json(route, 200, { devices: [{ ...TRUSTED_DEVICE, revokedAt }] })
  );

  await page.route(`**/bfm-api/operator/devices/${TRUSTED_DEVICE.id}`, (route) => {
    if (options.revokeStatus !== undefined) {
      return json(route, options.revokeStatus, { code: 'ServiceUnavailable', message: 'bfm down' });
    }
    revokedAt = new Date().toISOString();
    return json(route, 200, { id: TRUSTED_DEVICE.id, revokedAt, alreadyRevoked: false });
  });
}

async function openDevices(page: Page): Promise<void> {
  await page.goto('/bfm');
  await expect(page.getByRole('heading', { name: 'Devices' })).toBeVisible();
}

test.describe('bfm — Devices', () => {
  let errors: string[] = [];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('mints a code and shows it as a QR plus readable text', async ({ page }) => {
    await stubOperatorApi(page);
    await openDevices(page);

    await page.getByRole('button', { name: 'Pair a new device' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('img', { name: 'Pairing QR code' })).toBeVisible();
    await expect(dialog.getByTestId('pairing-code')).toHaveText(PAIRING_CODE);
    await expect(dialog.getByRole('timer')).toHaveText(/Expires in \d+:\d{2}/);
  });

  /**
   * A short TTL, not a long wait: the assertion is that the code disappears
   * when its deadline passes, and a two-second deadline tests that as well as
   * a five-minute one would.
   */
  test('stops showing the code once it expires', async ({ page }) => {
    await stubOperatorApi(page, { ttlSeconds: 2 });
    await openDevices(page);

    await page.getByRole('button', { name: 'Pair a new device' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('pairing-code')).toBeVisible();

    await expect(dialog.getByTestId('pairing-code')).toBeHidden();
    await expect(dialog.getByRole('img', { name: 'Pairing QR code' })).toBeHidden();
    await expect(dialog.getByText(/That code has expired/)).toBeVisible();
  });

  test('keeps the code out of storage and out of the URL', async ({ page }) => {
    await stubOperatorApi(page);
    await openDevices(page);

    await page.getByRole('button', { name: 'Pair a new device' }).click();
    await expect(page.getByTestId('pairing-code')).toBeVisible();

    const leaked = await page.evaluate(() => ({
      local: JSON.stringify(Object.entries(localStorage)),
      session: JSON.stringify(Object.entries(sessionStorage)),
      url: location.href,
    }));

    expect(leaked.local).not.toContain('7QK4');
    expect(leaked.session).not.toContain('7QK4');
    expect(leaked.url).not.toContain('7QK4');
  });

  test('lists the paired handset', async ({ page }) => {
    await stubOperatorApi(page);
    await openDevices(page);

    const row = page.getByRole('row', { name: /Joao's iPhone/ });
    await expect(row).toBeVisible();
    await expect(row.getByText('iPhone 17 Pro')).toBeVisible();
    await expect(row.getByText('Trusted')).toBeVisible();
  });

  test('revokes only after confirmation, and the row flips to revoked', async ({ page }) => {
    await stubOperatorApi(page);
    await openDevices(page);

    await page.getByRole('button', { name: "Revoke Joao's iPhone" }).click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByRole('heading', { name: "Revoke Joao's iPhone?" })).toBeVisible();

    await confirm.getByRole('button', { name: 'Revoke' }).click();

    await expect(confirm).toBeHidden();
    const row = page.getByRole('row', { name: /Joao's iPhone/ });
    await expect(row).toHaveAttribute('data-revoked', 'true');
    await expect(row.getByRole('button')).toHaveCount(0);
  });

  test('cancelling leaves the handset trusted', async ({ page }) => {
    await stubOperatorApi(page);
    await openDevices(page);

    await page.getByRole('button', { name: "Revoke Joao's iPhone" }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByRole('row', { name: /Joao's iPhone/ })).toHaveAttribute(
      'data-revoked',
      'false'
    );
  });

  test('a failed revocation says so and leaves the dialog open', async ({ page }) => {
    await stubOperatorApi(page, { revokeStatus: 503 });
    await openDevices(page);

    await page.getByRole('button', { name: "Revoke Joao's iPhone" }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.getByRole('button', { name: 'Revoke' }).click();

    await expect(confirm.getByRole('alert')).toContainText('still trusted');
    await expect(confirm).toBeVisible();
  });

  test('says the pillar is unavailable when the device list cannot be fetched', async ({
    page,
  }) => {
    await page.route('**/bfm-api/operator/devices', (route) =>
      json(route, 503, { code: 'ServiceUnavailable', message: 'bfm down' })
    );
    await openDevices(page);

    await expect(page.getByText(/did not answer\. Check that the pillar is running/)).toBeVisible();
  });
});
