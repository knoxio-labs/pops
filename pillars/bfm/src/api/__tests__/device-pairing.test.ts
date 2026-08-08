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
import { generateKeyPairSync } from 'node:crypto';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { PairedDeviceSchema } from '../../contract/rest-device-schemas.js';
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
import { PAIRING_PATH } from '../app.js';
import { verifyAccessToken } from '../auth/access-token.js';
import { createTestApp, PRODUCTION_ENV_WITHOUT_ACCESS, type TestApp } from './harness.js';

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

describe('the happy path', () => {
  it('answers 201 with a token pair the contract accepts', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    expect(res.status).toBe(201);
    const parsed = PairedDeviceSchema.safeParse(res.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it('mints an access token that carries the device id and passes the guard', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    // Verified with the app's own key rather than decoded: a token that parses
    // but does not verify would satisfy a shape assertion and nothing else.
    const claims = verifyAccessToken(res.body.accessToken, created.accessTokenSigningKey);
    expect(claims.sub).toBe(res.body.deviceId);
    expect(res.body.expiresIn).toBe(claims.exp - claims.iat);

    // 404 rather than 200: the guard passed and no `/mobile` route exists yet.
    // An unusable token would have been 401 here.
    const guarded = await request(created.app)
      .get('/mobile/anything')
      .set('Authorization', `Bearer ${String(res.body.accessToken)}`);
    expect(guarded.status).toBe(404);
  });

  it('creates exactly one device row, holding what the phone sent', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);
    const body = pairBody({ code });

    const res = await request(created.app).post(PAIRING_PATH).send(body);

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

    await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    const [device] = deviceRows(created);
    expect(device?.lastSeenAt).toBe(device?.createdAt);
  });

  it('opens a refresh-token family: one live row, stored only as a digest', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const res = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

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

    await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    const [token] = refreshTokenRows(created);
    const lifetimeMs = Date.parse(token?.expiresAt ?? '') - Date.parse(token?.createdAt ?? '');
    expect(lifetimeMs).toBe(90 * 24 * 60 * 60 * 1000);
    expect(lifetimeMs).not.toBe(DEFAULT_REFRESH_TOKEN_TTL_MS);
  });

  it('consumes the code it spent', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

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

      const res = await request(created.app)
        .post(PAIRING_PATH)
        .send(pairBody({ code: spell(code) }));

      expect(res.status).toBe(201);
    }
  });

  it('is reachable with no operator session — it is how a caller becomes anyone', async () => {
    // Under this env the operator routes refuse an anonymous caller. The
    // pairing route must not, or a phone could never pair: it has no Access
    // session and the whole surface exists for callers that have none.
    const created = open({ env: PRODUCTION_ENV_WITHOUT_ACCESS });
    const { code } = issuePairingCode(created.db);

    const res = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    expect(res.status).toBe(201);
  });

  it('trims the labels rather than storing a leading space as a name', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code, deviceName: '  Joao’s iPhone  ', deviceModel: ' iPhone17,1 ' }));

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

    const res = await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code, publicKey: urlSafe }));

    expect(res.status).toBe(201);
    expect(deviceRows(created)[0]?.publicKeyDer).toBe(standard);
  });
});

describe('a code that cannot be spent', () => {
  it('refuses a replay, and leaves the first device untouched', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const first = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));
    expect(first.status).toBe(201);

    const replay = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    expect(replay.status).toBe(403);
    expect(deviceRows(created)).toHaveLength(1);
    expect(refreshTokenRows(created)).toHaveLength(1);

    // The first phone is still paired. A replay that revoked the device it
    // could not duplicate would be a denial of service anyone could run.
    const guarded = await request(created.app)
      .get('/mobile/anything')
      .set('Authorization', `Bearer ${String(first.body.accessToken)}`);
    expect(guarded.status).toBe(404);
  });

  it('refuses an expired code', async () => {
    const created = open();
    const code = plantExpiredCode(created);

    const res = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    expect(res.status).toBe(403);
    expect(deviceRows(created)).toHaveLength(0);
  });

  it('refuses a code that was never issued', async () => {
    const created = open();

    const res = await request(created.app).post(PAIRING_PATH).send(pairBody());

    expect(res.status).toBe(403);
    expect(deviceRows(created)).toHaveLength(0);
  });

  it('writes nothing at all when it refuses', async () => {
    const created = open();
    const code = plantExpiredCode(created);

    await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    expect(deviceRows(created)).toHaveLength(0);
    expect(refreshTokenRows(created)).toHaveLength(0);
  });

  it('never returns a token on the refusal', async () => {
    const created = open();

    const res = await request(created.app).post(PAIRING_PATH).send(pairBody());

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

    const unknown = await request(created.app).post(PAIRING_PATH).send(pairBody());

    const expired = await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code: plantExpiredCode(created) }));

    const { code: spent } = issuePairingCode(created.db);
    await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code: spent }));
    const consumed = await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code: spent }));

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

    const res = await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code, publicKey: makeKey() }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_request');
    expect(deviceRows(created)).toHaveLength(0);
    expect(refreshTokenRows(created)).toHaveLength(0);
  });

  it('leaves the code spendable after a bad key, so 400 says nothing about it', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code, publicKey: 'not a key' }));

    const retry = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));

    expect(retry.status).toBe(201);
  });

  it('answers the same 400 whether the code was real or invented', async () => {
    const created = open();
    const { code } = issuePairingCode(created.db);

    const withRealCode = await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ code, publicKey: 'not a key' }));
    const withInventedCode = await request(created.app)
      .post(PAIRING_PATH)
      .send(pairBody({ publicKey: 'not a key' }));

    expect(withInventedCode.status).toBe(withRealCode.status);
    expect(withInventedCode.text).toBe(withRealCode.text);
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

    const res = await request(created.app).post(PAIRING_PATH).send(body);

    expect(res.status).toBe(400);
    // The declared shape, and only it. ts-rest's default would have shipped
    // the issue list, which describes the schema to whoever provoked it.
    expect(res.body).toEqual({
      code: 'invalid_request',
      message: expect.any(String),
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

    const issued = await request(created.app).post('/operator/pairing/codes').send({});
    expect(issued.status).toBe(201);

    const pairingUrl = new URL(String(issued.body.pairingUrl));
    const res = await request(created.app)
      .post(pairingUrl.pathname)
      .send(pairBody({ code: pairingUrl.searchParams.get('code') ?? '' }));

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

    await request(created.app).post(PAIRING_PATH).send(pairBody());
    await request(created.app).post(PAIRING_PATH).send(pairBody());
    const refused = await request(created.app).post(PAIRING_PATH).send(pairBody());

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

    await request(created.app).post(PAIRING_PATH).send(pairBody());
    const refused = await request(created.app).post(PAIRING_PATH).send(pairBody({ code }));
    expect(refused.status).toBe(429);

    const [row] = created.db.select().from(pairingCodes).all();
    expect(row?.consumedAt).toBeNull();
  });

  it('caps the whole route regardless of the address a caller claims', async () => {
    const created = open({ pairingRateLimit: { perClientLimit: 100, globalLimit: 2 } });

    const statuses: number[] = [];
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      const res = await request(created.app)
        .post(PAIRING_PATH)
        .set('CF-Connecting-IP', ip)
        .send(pairBody());
      statuses.push(res.status);
    }

    expect(statuses[2]).toBe(429);
  });

  it('charges a budget separate from the /mobile perimeter', async () => {
    // One counter for both would let ordinary phone traffic lock a handset out
    // of pairing, and a pairing flood degrade every paired device.
    const created = open({ pairingRateLimit: overBudget(1) });

    await request(created.app).post(PAIRING_PATH).send(pairBody());
    expect((await request(created.app).post(PAIRING_PATH).send(pairBody())).status).toBe(429);

    const mobile = await request(created.app).get('/mobile/anything');
    expect(mobile.status).toBe(401);
  });
});
