/**
 * `POST /devices/pair` over the real app, against a real SQLite file.
 *
 * The exchange is the trust anchor: everything after it is token mechanics,
 * and every property that matters here is one a passing happy-path test would
 * not notice. So the assertions come in pairs — what the caller was told, and
 * what was written — and the failure cases assert the *absence* of writes as
 * hard as the success case asserts their presence.
 *
 * The one property that cannot be seen through HTTP at all is rollback after a
 * partial write. That is `auth/__tests__/pairing-exchange.test.ts`, which can
 * induce a database error mid-transaction; this file cannot.
 */
import { generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  parseDeviceCapabilities,
  readRouteCapability,
} from '../../contract/capabilities.js';
import {
  DeviceInvalidRequestErrorSchema,
  PairedDeviceSchema,
  RefreshChallengeSchema,
  RefreshedSessionSchema,
} from '../../contract/rest-device-schemas.js';
import { DeviceListSchema } from '../../contract/rest-operator-schemas.js';
import { bfmContract } from '../../contract/rest.js';
import { spkiPublicKeyBase64 } from '../../db/__tests__/helpers.js';
import {
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  devices,
  generatePairingCode,
  hashPairingCode,
  hashRefreshToken,
  issuePairingCode,
  normalizePairingCode,
  pairingCodes,
  refreshTokens,
} from '../../db/index.js';
import { CHALLENGE_PATH, PAIRING_PATH, REFRESH_PATH } from '../app.js';
import { verifyAccessToken } from '../auth/access-token.js';
import { refreshSignatureMessage } from '../auth/refresh-exchange.js';
import {
  collectContractRoutes,
  isMobilePath,
  UNCONTRACTED_MOBILE_ROUTES,
} from '../auth/require-capability.js';
import { createMobileFinanceClient } from '../finance/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createFinanceFake, financeRow } from './finance-fake.js';
import { createTestApp, PRODUCTION_ENV_WITHOUT_ACCESS, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { PairingRateLimitOptions } from '../auth/pairing-rate-limit.js';
import type { TestAppOptions } from './harness.js';

const apps: TestApp[] = [];

function open(options: TestAppOptions = {}): TestApp {
  const created = createTestApp(options);
  apps.push(created);
  return created;
}

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
  vi.restoreAllMocks();
});

interface PairBody {
  code: string;
  publicKey: string;
  deviceName: string;
  deviceModel: string;
}

function pairBody(overrides: Partial<PairBody> = {}): PairBody {
  return {
    code: generatePairingCode(),
    publicKey: spkiPublicKeyBase64(),
    deviceName: "Joao's iPhone",
    deviceModel: 'iPhone17,1',
    ...overrides,
  };
}

/** A structurally valid SPKI key that is not the one the contract pins. */
function spkiPublicKeyOnCurve(namedCurve: string): string {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve });
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function rsaSpkiPublicKeyBase64(): string {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

/**
 * Plant a code whose window has already closed.
 *
 * Written straight to the table rather than issued and waited out: the row's
 * CHECK only requires `expiresAt > createdAt`, so an hour-old code that lived
 * five minutes is a perfectly legal row and the alternative is a sleeping test.
 */
function plantExpiredCode(app: TestApp): string {
  const code = generatePairingCode();
  const canonical = normalizePairingCode(code);
  if (canonical === null) throw new Error('generated code did not normalize');

  app.db
    .insert(pairingCodes)
    .values({
      codeHash: hashPairingCode(canonical),
      createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 55 * 60_000).toISOString(),
    })
    .run();
  return code;
}

function deviceRows(app: TestApp) {
  return app.db.select().from(devices).all();
}

function refreshTokenRows(app: TestApp) {
  return app.db.select().from(refreshTokens).all();
}

/** `POST /devices/pair` with an arbitrary body — every case in this file but the QR round trip. */
function pair(app: TestApp, body: object) {
  return requestOn(app.app, (r) => r.post(PAIRING_PATH).send(body));
}

describe('the happy path', () => {
  it('answers 201 with a token pair the contract accepts', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await pair(created, pairBody({ code }));

    expect(res.status).toBe(201);
    const parsed = PairedDeviceSchema.safeParse(res.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('mints an access token that carries the device id and passes the guard', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await pair(created, pairBody({ code }));

    // Verified with the app's own key rather than decoded: a token that parses
    // but does not verify would satisfy a shape assertion and nothing else.
    const claims = verifyAccessToken(res.body.accessToken, created.accessTokenSigningKey);
    expect(claims.sub).toBe(res.body.deviceId);
    expect(res.body.expiresIn).toBe(claims.exp - claims.iat);

    // 404 rather than 200: the guard passed and no `/mobile` route exists yet.
    // An unusable token would have been 401 here.
    const guarded = await requestOn(created.app, (r) =>
      r.get('/mobile/anything').set('Authorization', `Bearer ${String(res.body.accessToken)}`)
    );
    expect(guarded.status).toBe(404);
  });

  it('creates exactly one device row, holding what the phone sent', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);
    const body = pairBody({ code });

    const res = await pair(created, body);

    const rows = deviceRows(created);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: res.body.deviceId,
      name: body.deviceName,
      model: body.deviceModel,
      publicKeyDer: body.publicKey,
      revokedAt: null,
    });
  });

  it('starts lastSeenAt equal to createdAt — pairing is itself contact', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    await pair(created, pairBody({ code }));

    const [device] = deviceRows(created);
    expect(device?.lastSeenAt).toBe(device?.createdAt);
  });

  it('opens a refresh-token family: one live row, stored only as a digest', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await pair(created, pairBody({ code }));

    const rows = refreshTokenRows(created);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tokenHash: hashRefreshToken(res.body.refreshToken),
      deviceId: res.body.deviceId,
      consumedAt: null,
      revokedAt: null,
      replacedBy: null,
    });
    // The plaintext is returned once and never written.
    expect(JSON.stringify(rows[0])).not.toContain(res.body.refreshToken);
    expect(rows[0]?.familyId).not.toBe('');
  });

  it('dates the refresh token by the configured TTL', async () => {
    const created = open({ refreshTokenTtlMs: 90 * 24 * 60 * 60 * 1000 });
    const { code } = issuePairingCode(created.db);

    await pair(created, pairBody({ code }));

    const [token] = refreshTokenRows(created);
    const lifetimeMs = Date.parse(token?.expiresAt ?? '') - Date.parse(token?.createdAt ?? '');
    expect(lifetimeMs).toBe(90 * 24 * 60 * 60 * 1000);
    expect(lifetimeMs).not.toBe(DEFAULT_REFRESH_TOKEN_TTL_MS);
  });

  it('consumes the code it spent', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    await pair(created, pairBody({ code }));

    const [row] = created.db.select().from(pairingCodes).all();
    expect(row?.consumedAt).not.toBeNull();
  });

  it('accepts the code grouped, ungrouped and lower-cased — one code, three spellings', async () => {
    for (const spell of [
      (code: string) => code,
      (code: string) => code.replaceAll('-', ''),
      (code: string) => code.toLowerCase(),
    ]) {
      const created = open();
      const { code } = issuePairingCode(created.db);

      const res = await pair(created, pairBody({ code: spell(code) }));

      expect(res.status).toBe(201);
    }
  });

  it('is reachable with no operator session — it is how a caller becomes anyone', async () => {
    // Under this env the operator routes refuse an anonymous caller. The
    // pairing route must not, or a phone could never pair: it has no Access
    // session and the whole surface exists for callers that have none.
    const created = open({ env: PRODUCTION_ENV_WITHOUT_ACCESS });
    const { code } = issuePairingCode(created.db);

    const res = await pair(created, pairBody({ code }));

    expect(res.status).toBe(201);
  });

  it('trims the labels rather than storing a leading space as a name', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    await pair(
      created,
      pairBody({ code, deviceName: '  Joao’s iPhone  ', deviceModel: ' iPhone17,1 ' })
    );

    expect(deviceRows(created)[0]).toMatchObject({
      name: 'Joao’s iPhone',
      model: 'iPhone17,1',
    });
  });

  it('canonicalises a base64url key into the standard-alphabet column form', async () => {
    // The column documents standard base64. A handset that sends the same key
    // base64url-encoded must produce the same row, or two pairings of one
    // Secure Enclave key would not compare equal.
    const created = open();
    const { code } = issuePairingCode(created.db);
    const standard = spkiPublicKeyBase64();
    const urlSafe = Buffer.from(standard, 'base64').toString('base64url');
    expect(urlSafe).not.toBe(standard);

    const res = await pair(created, pairBody({ code, publicKey: urlSafe }));

    expect(res.status).toBe(201);
    expect(deviceRows(created)[0]?.publicKeyDer).toBe(standard);
  });
});

describe('a code that cannot be spent', () => {
  it('refuses a replay, and leaves the first device untouched', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const first = await pair(created, pairBody({ code }));
    expect(first.status).toBe(201);

    const replay = await pair(created, pairBody({ code }));

    expect(replay.status).toBe(403);
    expect(deviceRows(created)).toHaveLength(1);
    expect(refreshTokenRows(created)).toHaveLength(1);

    // The first phone is still paired. A replay that revoked the device it
    // could not duplicate would be a denial of service anyone could run.
    const guarded = await requestOn(created.app, (r) =>
      r.get('/mobile/anything').set('Authorization', `Bearer ${String(first.body.accessToken)}`)
    );
    expect(guarded.status).toBe(404);
  });

  it('refuses an expired code', async () => {
    const created = open();
    const code = plantExpiredCode(created);

    const res = await pair(created, pairBody({ code }));

    expect(res.status).toBe(403);
    expect(deviceRows(created)).toHaveLength(0);
  });

  it('refuses a code that was never issued', async () => {
    const created = open();

    const res = await pair(created, pairBody());

    expect(res.status).toBe(403);
    expect(deviceRows(created)).toHaveLength(0);
  });

  it('writes nothing at all when it refuses', async () => {
    const created = open();
    const code = plantExpiredCode(created);

    await pair(created, pairBody({ code }));

    expect(deviceRows(created)).toHaveLength(0);
    expect(refreshTokenRows(created)).toHaveLength(0);
  });

  it('never returns a token on the refusal', async () => {
    const created = open();

    const res = await pair(created, pairBody());

    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.body).not.toHaveProperty('refreshToken');
    expect(res.body).not.toHaveProperty('deviceId');
  });
});

describe('the three rejections are one rejection', () => {
  /**
   * The property this whole route turns on. A response that distinguished
   * "never issued" from "expired" from "already spent" would answer, one guess
   * per request, the question the code's entropy exists to make unanswerable:
   * *was this a real code?*
   *
   * Compared as raw text and status rather than as parsed bodies, because a
   * difference in whitespace or key order is still a difference an attacker can
   * measure.
   */
  it('answers unknown, expired and consumed byte for byte alike', async () => {
    const created = open();

    const unknown = await pair(created, pairBody());

    const expired = await pair(created, pairBody({ code: plantExpiredCode(created) }));

    const { code: spent } = issuePairingCode(created.db);
    await pair(created, pairBody({ code: spent }));
    const consumed = await pair(created, pairBody({ code: spent }));

    const shapes = [unknown, expired, consumed].map((res) => ({
      status: res.status,
      text: res.text,
      contentType: res.headers['content-type'],
    }));
    expect(shapes[1]).toEqual(shapes[0]);
    expect(shapes[2]).toEqual(shapes[0]);
    expect(shapes[0]?.status).toBe(403);
  });
});

describe('the public key', () => {
  /**
   * Every case here must answer 400 **and** leave the code spendable. The
   * second half is the load-bearing one: the key is parsed before the code is
   * touched precisely so that a caller cannot post a deliberately broken key
   * with a guessed code and read the status as an oracle — 403 for a wrong
   * code, 400 for a right one. If a bad key ever burned a code, that oracle is
   * back.
   */
  const badKeys: Array<[string, () => string]> = [
    ['not base64 at all', () => 'this is not a key'],
    ['base64 of nothing structured', () => Buffer.from('hello').toString('base64')],
    ['a well-formed key on the wrong curve', () => spkiPublicKeyOnCurve('P-384')],
    ['a well-formed key of the wrong kind', () => rsaSpkiPublicKeyBase64()],
  ];

  it.each(badKeys)('rejects %s with 400, writing nothing', async (_label, makeKey) => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await pair(created, pairBody({ code, publicKey: makeKey() }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bfm.request.invalid');
    expect(deviceRows(created)).toHaveLength(0);
    expect(refreshTokenRows(created)).toHaveLength(0);
  });

  it('leaves the code spendable after a bad key, so 400 says nothing about it', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    await pair(created, pairBody({ code, publicKey: 'not a key' }));

    const retry = await pair(created, pairBody({ code }));

    expect(retry.status).toBe(201);
  });

  it('answers the same 400 whether the code was real or invented', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const withRealCode = await pair(created, pairBody({ code, publicKey: 'not a key' }));
    const withInventedCode = await pair(created, pairBody({ publicKey: 'not a key' }));

    expect(withInventedCode.status).toBe(withRealCode.status);
    const realBody = DeviceInvalidRequestErrorSchema.parse(withRealCode.body);
    const inventedBody = DeviceInvalidRequestErrorSchema.parse(withInventedCode.body);
    expect({ ...inventedBody, requestId: undefined }).toEqual({
      ...realBody,
      requestId: undefined,
    });
    expect(inventedBody.requestId).not.toBe(realBody.requestId);
  });
});

describe('a malformed request', () => {
  it.each([
    ['a missing field', { code: 'AAAA-BBBB-CCCC', publicKey: 'x', deviceName: 'a' }],
    ['a wrong type', { code: 7, publicKey: 'x', deviceName: 'a', deviceModel: 'b' }],
    ['a blank name', { code: 'A', publicKey: 'x', deviceName: '   ', deviceModel: 'b' }],
    [
      'an oversized name',
      { code: 'A', publicKey: 'x', deviceName: 'n'.repeat(65), deviceModel: 'b' },
    ],
  ])('answers %s with the contract 400, not the validator internals', async (_label, body) => {
    const created = open();

    const res = await pair(created, body);

    expect(res.status).toBe(400);
    // The declared shape, and only it. ts-rest's default would have shipped
    // the issue list, which describes the schema to whoever provoked it.
    expect(res.body).toEqual({
      code: 'bfm.request.invalid',
      message: expect.any(String),
      requestId: expect.any(String),
      retryable: false,
    });
    expect(res.text).not.toMatch(/publicKey|deviceName|zod|issues/iu);
  });
});

describe('the round trip an operator actually performs', () => {
  it('mints a code, and the URL on its QR pairs the phone that scans it', async () => {
    // The two halves of pairing meet here and nowhere else in the suite: every
    // other test posts to `PAIRING_PATH` directly, so all of them would still
    // pass with a QR pointing at a route that does not exist. The handset has
    // nothing but this URL.
    const created = open();

    const issued = await requestOn(created.app, (r) => r.post('/operator/pairing/codes').send({}));
    expect(issued.status).toBe(201);

    const pairingUrl = new URL(String(issued.body.pairingUrl));
    const res = await requestOn(created.app, (r) =>
      r
        .post(pairingUrl.pathname)
        .send(pairBody({ code: pairingUrl.searchParams.get('code') ?? '' }))
    );

    expect(res.status).toBe(201);
    expect(deviceRows(created)).toHaveLength(1);
  });
});

describe('the budget', () => {
  function overBudget(perClientLimit: number): PairingRateLimitOptions {
    return { perClientLimit, globalLimit: 1_000 };
  }

  it('answers 429 with Retry-After once a client is over its per-client budget', async () => {
    const created = open({ pairingRateLimit: overBudget(2) });

    await pair(created, pairBody());
    await pair(created, pairBody());
    const refused = await pair(created, pairBody());

    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe('rate_limited');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('refuses before spending a code, so a flood cannot burn one', async () => {
    // The budget is mounted on the path, ahead of the body parser and ahead of
    // the handler. A limiter that ran after the exchange would answer 429 and
    // still have consumed the code in the request that provoked it.
    const created = open({ pairingRateLimit: overBudget(1) });
    const { code } = issuePairingCode(created.db);

    await pair(created, pairBody());
    const refused = await pair(created, pairBody({ code }));
    expect(refused.status).toBe(429);

    const [row] = created.db.select().from(pairingCodes).all();
    expect(row?.consumedAt).toBeNull();
  });

  it('caps the whole route regardless of the address a caller claims', async () => {
    const created = open({ pairingRateLimit: { perClientLimit: 100, globalLimit: 2 } });

    const statuses: number[] = [];
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      const res = await requestOn(created.app, (r) =>
        r.post(PAIRING_PATH).set('CF-Connecting-IP', ip).send(pairBody())
      );
      statuses.push(res.status);
    }

    expect(statuses[2]).toBe(429);
  });

  it('charges a budget separate from the /mobile perimeter', async () => {
    // One counter for both would let ordinary phone traffic lock a handset out
    // of pairing, and a pairing flood degrade every paired device.
    const created = open({ pairingRateLimit: overBudget(1) });

    await pair(created, pairBody());
    expect((await pair(created, pairBody())).status).toBe(429);

    const mobile = await requestOn(created.app, (r) => r.get('/mobile/anything'));
    expect(mobile.status).toBe(401);
  });
});

const GUEST_EMAIL = 'rosane@example.test';

/** Pair through the real route with a code minted for {@link GUEST_EMAIL}. */
async function pairGuest(app: TestApp, body: object = {}) {
  const { code } = issuePairingCode(app.db, { subjectEmail: GUEST_EMAIL });
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  const res = await pair(app, {
    ...pairBody({
      code,
      publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      deviceName: 'Guest iPhone',
    }),
    ...body,
  });

  return { res, privateKey };
}

interface GatedRoute {
  readonly method: string;
  readonly path: string;
  readonly capability: string;
}

/** Every `/mobile` route the gate knows, with a placeholder in each path parameter. */
function gatedMobileRoutes(): GatedRoute[] {
  const contracted = collectContractRoutes(bfmContract)
    .filter((route) => isMobilePath(route.path))
    .map((route) => {
      const capability = readRouteCapability(route.metadata);
      if (capability === null) throw new Error(`${route.path} declares no capability`);
      return { method: route.method, path: route.path, capability };
    });

  return [...contracted, ...UNCONTRACTED_MOBILE_ROUTES].map((route) => ({
    method: route.method.toUpperCase(),
    path: route.path.replaceAll(/:[^/]+/gu, 'placeholder'),
    capability: route.capability,
  }));
}

function send(app: TestApp, route: GatedRoute, accessToken: string) {
  return requestOn(app.app, (r) => {
    const authorization = `Bearer ${accessToken}`;
    if (route.method === 'GET') return r.get(route.path).set('Authorization', authorization);
    if (route.method === 'POST') return r.post(route.path).set('Authorization', authorization);
    if (route.method === 'PUT') return r.put(route.path).set('Authorization', authorization);
    if (route.method === 'PATCH') return r.patch(route.path).set('Authorization', authorization);
    if (route.method === 'DELETE') return r.delete(route.path).set('Authorization', authorization);
    throw new Error(`no request builder for ${route.method}`);
  });
}

describe('a code minted for a guest', () => {
  it('pairs a device bound to that guest with the explicit guest grant', async () => {
    const created = open();

    const { res } = await pairGuest(created);

    expect(res.status).toBe(201);
    const [device] = deviceRows(created);
    if (device === undefined) throw new Error('expected a device row');
    expect(device.id).toBe(res.body.deviceId);
    expect(device.subjectEmail).toBe(GUEST_EMAIL);
    expect(device.capabilityMode).toBe('explicit');
    expect(parseDeviceCapabilities(device.capabilities, device.id)).toEqual([
      ...GUEST_DEVICE_CAPABILITIES,
    ]);
  });

  it('answers the same body an operator pairing does, with no subject in it', async () => {
    const created = open();

    const { res } = await pairGuest(created);

    expect(PairedDeviceSchema.safeParse(res.body).success).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(GUEST_EMAIL);
  });

  it('ignores a subject the handset sends: the code decides, not the request', async () => {
    const created = open();

    const { res } = await pairGuest(created, {
      subjectEmail: null,
      capabilityMode: 'tracks-default',
    });

    // The extra fields are dropped by the body schema. What must not happen
    // is a device the request talked into being the operator's.
    expect(res.status).toBe(201);
    const rows = deviceRows(created);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectEmail).toBe(GUEST_EMAIL);
    expect(rows[0]?.capabilityMode).toBe('explicit');
  });

  it('cannot make an operator code pair a guest device by naming a subject in the body', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await pair(created, { ...pairBody({ code }), subjectEmail: GUEST_EMAIL });

    expect(res.status).toBe(201);
    const rows = deviceRows(created);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectEmail).toBeNull();
    expect(rows[0]?.capabilityMode).toBe('tracks-default');
  });

  it('is refused 403 on every mobile route outside the guest grant', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const created = open({
      mobileRateLimit: { perClientLimit: 1_000, globalLimit: 1_000 },
      receiptRateLimit: { perClientLimit: 1_000, globalLimit: 1_000 },
      egoRateLimit: { perClientLimit: 1_000, globalLimit: 1_000 },
    });
    const { res } = await pairGuest(created);
    const accessToken = String(res.body.accessToken);

    const refused = gatedMobileRoutes().filter(
      (route) => !GUEST_DEVICE_CAPABILITIES.some((granted) => granted === route.capability)
    );

    // The list is read off the contract, so prove it is not empty and that it
    // reaches every pillar a guest must stay out of before trusting the loop.
    for (const pillar of ['purchases', 'inventory', 'contacts', 'barcode', 'ego']) {
      expect(refused.some((route) => route.path.startsWith(`/mobile/${pillar}/`))).toBe(true);
    }

    for (const route of refused) {
      const answered = await send(created, route, accessToken);

      expect([route.method, route.path, answered.status]).toEqual([route.method, route.path, 403]);
      expect(answered.body).toMatchObject({
        code: 'capability_not_granted',
        capability: route.capability,
      });
    }
  });

  it('is let through the gate on a route the guest grant covers', async () => {
    const fake = createFinanceFake([financeRow({ id: 'txn-1' })]);
    const created = open({ finance: createMobileFinanceClient(createPillarGateway(fake.factory)) });
    const { res } = await pairGuest(created);

    const answered = await requestOn(created.app, (r) =>
      r
        .get(bfmContract.mobileFinance.listTransactions.path)
        .set('Authorization', `Bearer ${String(res.body.accessToken)}`)
    );

    expect(answered.status).toBe(200);
  });

  it('keeps its subject and its grant across a refresh', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const created = open();
    const { res, privateKey } = await pairGuest(created);
    const refreshToken = String(res.body.refreshToken);

    const challenged = await requestOn(created.app, (r) => r.post(CHALLENGE_PATH).send({}));
    const { nonce } = RefreshChallengeSchema.parse(challenged.body);
    const signature = sign(
      'sha256',
      refreshSignatureMessage(nonce, hashRefreshToken(refreshToken)),
      {
        key: privateKey,
        dsaEncoding: 'der',
      }
    ).toString('base64');
    const refreshed = await requestOn(created.app, (r) =>
      r.post(REFRESH_PATH).send({ refreshToken, nonce, signature })
    );

    expect(refreshed.status).toBe(200);
    const session = RefreshedSessionSchema.parse(refreshed.body);
    const [device] = deviceRows(created);
    expect(device?.subjectEmail).toBe(GUEST_EMAIL);
    expect(device?.capabilityMode).toBe('explicit');
    expect(parseDeviceCapabilities(device?.capabilities ?? '', 'd')).toEqual([
      ...GUEST_DEVICE_CAPABILITIES,
    ]);

    // And the refreshed token is still a guest's: a purchases read is refused.
    const purchases = await requestOn(created.app, (r) =>
      r
        .get(bfmContract.mobilePurchases.listPurchases.path)
        .set('Authorization', `Bearer ${session.accessToken}`)
    );
    expect(purchases.status).toBe(403);
    expect(purchases.body.code).toBe('capability_not_granted');
  });

  it('shows up in the operator device list with its subject, and can be revoked', async () => {
    const created = open();
    const { res } = await pairGuest(created);
    const { code } = issuePairingCode(created.db);
    await pair(created, pairBody({ code }));

    const listed = await requestOn(created.app, (r) => r.get('/operator/devices'));

    expect(listed.status).toBe(200);
    const bySubject = DeviceListSchema.parse(listed.body).devices.map(
      (device) => device.subjectEmail
    );
    expect(bySubject.toSorted()).toEqual([GUEST_EMAIL, null].toSorted());

    const revoked = await requestOn(created.app, (r) =>
      r.delete(`/operator/devices/${String(res.body.deviceId)}`)
    );
    expect(revoked.status).toBe(200);
    const after = await requestOn(created.app, (r) =>
      r
        .get(bfmContract.mobileFinance.listTransactions.path)
        .set('Authorization', `Bearer ${String(res.body.accessToken)}`)
    );
    expect(after.status).toBe(403);
    expect(after.body.code).toBe('bfm.auth.device_revoked');
  });
});

describe('the operator path, which names no subject', () => {
  it('still mints a code with no subject and pairs a full operator device from it', async () => {
    // No operator list and no Access team are configured here, which is what
    // production runs with today: nothing about a subject may change it.
    const created = open();

    const issued = await requestOn(created.app, (r) => r.post('/operator/pairing/codes').send({}));
    expect(issued.status).toBe(201);
    const [codeRow] = created.db.select().from(pairingCodes).all();
    expect(codeRow?.subjectEmail).toBeNull();

    const res = await pair(created, pairBody({ code: String(issued.body.code) }));

    expect(res.status).toBe(201);
    const [device] = deviceRows(created);
    if (device === undefined) throw new Error('expected a device row');
    expect(device.subjectEmail).toBeNull();
    expect(device.capabilityMode).toBe('tracks-default');
    expect(parseDeviceCapabilities(device.capabilities, device.id)).toEqual([
      ...DEFAULT_DEVICE_CAPABILITIES,
    ]);
  });

  it('cannot be given a subject through the request body', async () => {
    const created = open();

    const issued = await requestOn(created.app, (r) =>
      r.post('/operator/pairing/codes').send({ subjectEmail: GUEST_EMAIL })
    );

    expect(issued.status).toBe(201);
    const rows = created.db.select().from(pairingCodes).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectEmail).toBeNull();
  });
});
