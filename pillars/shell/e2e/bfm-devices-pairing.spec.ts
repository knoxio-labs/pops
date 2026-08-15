/**
 * bfm Devices — mint a pairing code, see the paired handset, revoke it.
 *
 * bfm itself does not need to be up: its three operator routes are fulfilled
 * at the `/bfm-api` proxy path. What is under test is the page — that it asks
 * for a code, renders what came back, lists what is paired, and cuts a device
 * off only after the operator confirms.
 */
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import { assertMatchesContract, fulfilWith, json, stubShellBoot } from './helpers/pillar-rest';

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

/**
 * The three operator routes' 2xx bodies, hand-mirrored from bfm's own zod
 * schemas (`pillars/bfm/src/contract/rest-operator-schemas.ts`:
 * `IssuedPairingCodeSchema`, `DeviceListSchema`, `RevokedDeviceSchema`) rather
 * than imported. `shell-no-cross-internal` (`.dependency-cruiser.cjs`) lets
 * the shell import another pillar's `@pops/app-<id>` UI package via its
 * `index.ts` entrypoint only — not that pillar's own `@pops/<id>` contract
 * package, so `@pops/bfm` is not reachable from an e2e spec either.
 */
const IssuedPairingCodeResponseSchema = z
  .object({
    code: z.string(),
    pairingUrl: z.url(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

const DeviceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    model: z.string(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();

const DeviceListResponseSchema = z.object({ devices: z.array(DeviceSchema) }).strict();

const RevokedDeviceResponseSchema = z
  .object({
    id: z.string(),
    revokedAt: z.iso.datetime(),
    alreadyRevoked: z.boolean(),
  })
  .strict();

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

  await page.route(
    '**/bfm-api/operator/pairing/codes',
    fulfilWith(
      201,
      IssuedPairingCodeResponseSchema,
      {
        code: PAIRING_CODE,
        pairingUrl: PAIRING_URL,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      },
      'operator.issuePairingCode'
    )
  );

  await page.route('**/bfm-api/operator/devices', (route) => {
    // Body depends on `revokedAt`, mutated after this route is registered —
    // validated per-call rather than once at setup, unlike the other two
    // routes here, so a later revocation is checked against the contract too.
    const body = { devices: [{ ...TRUSTED_DEVICE, revokedAt }] };
    assertMatchesContract(DeviceListResponseSchema, body, 'operator.listDevices');
    return json(route, 200, body);
  });

  await page.route(`**/bfm-api/operator/devices/${TRUSTED_DEVICE.id}`, (route) => {
    if (options.revokeStatus !== undefined) {
      // Not a documented bfm error shape (bfm's own `OperatorRevokeDeviceErrors`
      // covers only 401/404) — this exercises the shell's resilience to an
      // upstream outage, not a real bfm response, so it is intentionally
      // unvalidated.
      return json(route, options.revokeStatus, { code: 'ServiceUnavailable', message: 'bfm down' });
    }
    revokedAt = new Date().toISOString();
    const body = { id: TRUSTED_DEVICE.id, revokedAt, alreadyRevoked: false };
    assertMatchesContract(RevokedDeviceResponseSchema, body, 'operator.revokeDevice');
    return json(route, 200, body);
  });
}

async function openDevices(page: Page): Promise<void> {
  await stubShellBoot(page);
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

  /**
   * Real-browser check, because jsdom is not authoritative about how Escape
   * reaches Radix. The DELETE is already on the wire and cannot be called
   * back, so a dialog that vanished here would read as cancelled while the
   * revocation went ahead regardless.
   */
  test('Escape does not dismiss the confirmation mid-revocation', async ({ page }) => {
    let announceReached!: () => void;
    const revokeReached = new Promise<void>((resolve) => {
      announceReached = resolve;
    });

    // Held open so the assertions below land while the request is genuinely in
    // flight, and released by the test rather than by a timer.
    let releaseRevoke!: () => void;
    const revokeHeld = new Promise<void>((resolve) => {
      releaseRevoke = resolve;
    });

    await stubOperatorApi(page);
    await page.route(`**/bfm-api/operator/devices/${TRUSTED_DEVICE.id}`, async (route) => {
      announceReached();
      await revokeHeld;
      const body = {
        id: TRUSTED_DEVICE.id,
        revokedAt: '2026-08-08T12:00:00.000Z',
        alreadyRevoked: false,
      };
      assertMatchesContract(RevokedDeviceResponseSchema, body, 'operator.revokeDevice');
      return json(route, 200, body);
    });

    await openDevices(page);
    await page.getByRole('button', { name: "Revoke Joao's iPhone" }).click();

    const confirm = page.getByRole('alertdialog');
    await confirm.getByRole('button', { name: 'Revoke' }).click();
    await revokeReached;

    await page.keyboard.press('Escape');
    await expect(confirm.getByRole('button', { name: 'Revoking…' })).toBeVisible();
    await expect(confirm).toBeVisible();

    // The other way out of a Radix dialog. AlertDialog is supposed to ignore
    // it, but "supposed to" is what the Escape path also looked like.
    await page.mouse.click(8, 8);
    await expect(confirm).toBeVisible();

    // Closes once the request settles, not before. The row flipping to revoked
    // is the other test's job — this one replaces the DELETE route, so it does
    // not drive the stub's revocation state.
    releaseRevoke();
    await expect(confirm).toBeHidden();
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
    // Not a documented bfm error shape (`OperatorListDevicesErrors` covers only
    // 401) — this exercises the shell's own "pillar unavailable" fallback, not
    // a real bfm response, so it is intentionally unvalidated.
    await page.route('**/bfm-api/operator/devices', (route) =>
      json(route, 503, { code: 'ServiceUnavailable', message: 'bfm down' })
    );
    await openDevices(page);

    await expect(page.getByText(/did not answer\. Check that the pillar is running/)).toBeVisible();
  });
});
