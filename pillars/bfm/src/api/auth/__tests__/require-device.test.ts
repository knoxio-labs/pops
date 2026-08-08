/**
 * The guard driven end to end: a real Express app, a real migrated SQLite
 * database, real device rows. Nothing here is stubbed, because the failures
 * worth catching — a revoked row that still passes, a 403 answered as a 401 —
 * live in the seam between the token check and the row lookup, which is
 * exactly what a stub would paper over.
 */
import { eq } from 'drizzle-orm';
import express, { type Express } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MobileAuthErrorSchema,
  DeviceRevokedErrorSchema,
  MobileInvalidTokenErrorSchema,
} from '../../../contract/rest-schemas.js';
import { deviceRow, openTempDb, requireRow } from '../../../db/__tests__/helpers.js';
import { devices } from '../../../db/index.js';
import { testSigningKey } from '../../__tests__/harness.js';
import { requestOn } from '../../__tests__/test-http.js';
import { ACCESS_TOKEN_TTL_SECONDS, mintAccessToken } from '../access-token.js';
import {
  createRequireDevice,
  LAST_SEEN_COALESCE_WINDOW_MS,
  readDevice,
} from '../require-device.js';

import type { KeyObject } from 'node:crypto';

import type { OpenedBfmDb } from '../../../db/index.js';

const signingKey = testSigningKey();
const otherKey = testSigningKey('a-different-deployments-signing-key');

interface Harness {
  app: Express;
  opened: OpenedBfmDb;
  cleanup: () => void;
}

/**
 * The guard mounted the way `app.ts` mounts it — as a path prefix — with one
 * gated route behind it and one ungated route beside it.
 */
function harness(key: KeyObject = signingKey): Harness {
  const { opened, cleanup } = openTempDb();
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/mobile', createRequireDevice({ db: opened.db, accessTokenSigningKey: key }));
  app.get('/mobile/whoami', (_req, res) => {
    res.json({ deviceId: readDevice(res).id });
  });
  return { app, opened, cleanup };
}

function insertDevice(
  opened: OpenedBfmDb,
  overrides: Parameters<typeof deviceRow>[0] = {}
): string {
  const row = deviceRow(overrides);
  opened.db.insert(devices).values(row).run();
  return row.id;
}

function lastSeenAt(opened: OpenedBfmDb, id: string): string {
  return requireRow(opened.db.select().from(devices).where(eq(devices.id, id)).get(), 'device')
    .lastSeenAt;
}

const harnesses: Harness[] = [];

function open(key?: KeyObject): Harness {
  const created = harness(key);
  harnesses.push(created);
  return created;
}

afterEach(() => {
  while (harnesses.length > 0) {
    harnesses.pop()?.cleanup();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a valid token', () => {
  it('passes and hands the device row to the route', async () => {
    const h = open();
    const deviceId = insertDevice(h.opened);
    const { token } = mintAccessToken(deviceId, signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deviceId });
  });

  it('accepts the scheme case-insensitively, as RFC 7235 requires', async () => {
    const h = open();
    const deviceId = insertDevice(h.opened);
    const { token } = mintAccessToken(deviceId, signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `bearer ${token}`)
    );

    expect(res.status).toBe(200);
  });
});

describe('401 — the app should refresh', () => {
  it('rejects a request with no Authorization header', async () => {
    const h = open();

    const res = await requestOn(h.app, (r) => r.get('/mobile/whoami'));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'invalid_token', message: expect.any(String) });
  });

  it.each([
    ['a bare token with no scheme', (t: string) => t],
    ['the wrong scheme', (t: string) => `Basic ${t}`],
    ['an empty Bearer value', () => 'Bearer '],
    ['two comma-joined credentials', (t: string) => `Bearer ${t}, Bearer ${t}`],
  ])('rejects %s', async (_label, build) => {
    const h = open();
    const deviceId = insertDevice(h.opened);
    const { token } = mintAccessToken(deviceId, signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', build(token))
    );

    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00Z'));
    const h = open();
    const deviceId = insertDevice(h.opened);
    const { token } = mintAccessToken(deviceId, signingKey);
    vi.setSystemTime(new Date(Date.now() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000));

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(401);
  });

  it('rejects a token signed with another deployment key', async () => {
    const h = open();
    const deviceId = insertDevice(h.opened);
    const { token } = mintAccessToken(deviceId, otherKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(401);
  });

  it('rejects a structurally valid token for a device that has no row', async () => {
    // Not a 403: revocation is a soft delete, so an absent row cannot mean
    // "revoked". Refresh will fail truthfully and send the app back to pairing.
    const h = open();
    const { token } = mintAccessToken(crypto.randomUUID(), signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_token');
  });

  it('sends a Bearer challenge, so the client knows what it failed to present', async () => {
    const h = open();

    const res = await requestOn(h.app, (r) => r.get('/mobile/whoami'));

    expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
  });
});

describe('403 — the app should re-pair', () => {
  it('rejects a valid token for a revoked device', async () => {
    const h = open();
    const deviceId = insertDevice(h.opened, { revokedAt: '2026-08-01T09:00:00.000Z' });
    const { token } = mintAccessToken(deviceId, signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'device_revoked', message: expect.any(String) });
  });

  it('does not send a Bearer challenge — a fresh token would not help', async () => {
    const h = open();
    const deviceId = insertDevice(h.opened, { revokedAt: '2026-08-01T09:00:00.000Z' });
    const { token } = mintAccessToken(deviceId, signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('logs the revoked device, since a stolen handset still calling is the event to see', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = open();
    const deviceId = insertDevice(h.opened, { revokedAt: '2026-08-01T09:00:00.000Z' });
    const { token } = mintAccessToken(deviceId, signingKey);

    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(deviceId);
    expect(warn.mock.calls[0]?.[0]).not.toContain(token);
  });
});

describe('what never reaches the logs', () => {
  it('logs nothing for a 401, which any internet scanner can provoke', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const h = open();
    const { token } = mintAccessToken(crypto.randomUUID(), otherKey);

    await requestOn(h.app, (r) => r.get('/mobile/whoami'));
    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('the refusal body', () => {
  it.each([
    ['401', undefined],
    ['403', '2026-08-01T09:00:00.000Z'],
  ])('satisfies the contract schema on a %s', async (_label, revokedAt) => {
    const h = open();
    const deviceId = insertDevice(h.opened, revokedAt === undefined ? {} : { revokedAt });
    const { token } = mintAccessToken(deviceId, revokedAt === undefined ? otherKey : signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(MobileAuthErrorSchema.safeParse(res.body).success).toBe(true);
  });

  /**
   * The contract declares a literal `code` per status rather than one two-member
   * enum on both, so a generated client never has to branch on a combination
   * the guard cannot produce. That only stays true while the guard agrees, and
   * the guard is the half a schema cannot enforce on its own.
   */
  it('pairs 401 with invalid_token and nothing else', async () => {
    const h = open();
    const deviceId = insertDevice(h.opened);
    const { token } = mintAccessToken(deviceId, otherKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(401);
    expect(MobileInvalidTokenErrorSchema.safeParse(res.body).success).toBe(true);
    expect(DeviceRevokedErrorSchema.safeParse(res.body).success).toBe(false);
  });

  it('pairs 403 with device_revoked and nothing else', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = open();
    const deviceId = insertDevice(h.opened, { revokedAt: '2026-08-01T09:00:00.000Z' });
    const { token } = mintAccessToken(deviceId, signingKey);

    const res = await requestOn(h.app, (r) =>
      r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(403);
    expect(DeviceRevokedErrorSchema.safeParse(res.body).success).toBe(true);
    expect(MobileInvalidTokenErrorSchema.safeParse(res.body).success).toBe(false);
  });
});

describe('lastSeenAt', () => {
  const PAIRED_AT = '2027-01-01T00:00:00.000Z';

  /**
   * `lastSeenAt` set explicitly rather than left to the column's own default.
   * That default is SQLite's `strftime('now')`, which reads the real system
   * clock — `vi.setSystemTime` fakes only `Date`, so a row left to default
   * would carry the wall-clock instant the test actually ran, not the fictional
   * one these tests reason about.
   */
  function pairedDevice(h: Harness, overrides: Parameters<typeof deviceRow>[0] = {}): string {
    return insertDevice(h.opened, { createdAt: PAIRED_AT, lastSeenAt: PAIRED_AT, ...overrides });
  }

  it('advances for a device calling after the coalescing window has elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PAIRED_AT));
    const h = open();
    const deviceId = pairedDevice(h);
    const { token } = mintAccessToken(deviceId, signingKey);

    vi.setSystemTime(new Date(Date.parse(PAIRED_AT) + LAST_SEEN_COALESCE_WINDOW_MS + 1));
    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));

    expect(lastSeenAt(h.opened, deviceId)).toBe('2027-01-01T00:01:00.001Z');
  });

  it('does not advance again for a second call inside the coalescing window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PAIRED_AT));
    const h = open();
    const deviceId = pairedDevice(h);
    const { token } = mintAccessToken(deviceId, signingKey);

    vi.setSystemTime(new Date(Date.parse(PAIRED_AT) + LAST_SEEN_COALESCE_WINDOW_MS + 1));
    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));
    const afterFirst = lastSeenAt(h.opened, deviceId);

    vi.setSystemTime(new Date(Date.now() + LAST_SEEN_COALESCE_WINDOW_MS - 1));
    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));

    expect(lastSeenAt(h.opened, deviceId)).toBe(afterFirst);
  });

  it('advances again once a second call is itself outside the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PAIRED_AT));
    const h = open();
    const deviceId = pairedDevice(h);
    const { token } = mintAccessToken(deviceId, signingKey);

    vi.setSystemTime(new Date(Date.parse(PAIRED_AT) + LAST_SEEN_COALESCE_WINDOW_MS + 1));
    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));
    const afterFirst = lastSeenAt(h.opened, deviceId);

    vi.setSystemTime(new Date(Date.now() + LAST_SEEN_COALESCE_WINDOW_MS + 1));
    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));

    expect(lastSeenAt(h.opened, deviceId) > afterFirst).toBe(true);
  });

  it('does not advance for an unauthenticated request', async () => {
    const h = open();
    const deviceId = pairedDevice(h);

    await requestOn(h.app, (r) => r.get('/mobile/whoami'));

    expect(lastSeenAt(h.opened, deviceId)).toBe(PAIRED_AT);
  });

  it('does not advance for a revoked device — a 403 is not contact this column endorses', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = open();
    const deviceId = pairedDevice(h, { revokedAt: '2026-08-01T09:00:00.000Z' });
    const { token } = mintAccessToken(deviceId, signingKey);

    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));

    expect(lastSeenAt(h.opened, deviceId)).toBe(PAIRED_AT);
  });

  it('touches only the device that called', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PAIRED_AT));
    const h = open();
    const deviceId = pairedDevice(h);
    const otherId = pairedDevice(h);
    const { token } = mintAccessToken(deviceId, signingKey);

    vi.setSystemTime(new Date(Date.parse(PAIRED_AT) + LAST_SEEN_COALESCE_WINDOW_MS + 1));
    await requestOn(h.app, (r) => r.get('/mobile/whoami').set('Authorization', `Bearer ${token}`));

    expect(lastSeenAt(h.opened, otherId)).toBe(PAIRED_AT);
  });
});

describe('readDevice', () => {
  it('throws when a route was mounted outside the guard', () => {
    const res = { locals: {} } as unknown as Parameters<typeof readDevice>[0];

    expect(() => readDevice(res)).toThrow(/not behind requireDevice/);
  });
});
