/**
 * `POST /devices/challenge` and `POST /devices/refresh` over the real app,
 * against a real SQLite file.
 *
 * The state machine itself is proved next door in
 * `auth/__tests__/refresh-exchange.test.ts`, which can see rows. What is proved
 * here is everything that only exists once the routes are mounted: that the
 * refusals reach the wire as the statuses the phone switches on, that the
 * bodies match the shapes the generated client is built from, that the budget
 * is charged on the paths rather than merely configured, and that two requests
 * carrying the same token cannot both come back 200.
 *
 * A phone drives it end to end here — pair, challenge, sign, refresh, use the
 * new access token — because a refresh that returned a token `/mobile` will not
 * accept is a green suite and a broken app.
 */
import { generateKeyPairSync, sign } from 'node:crypto';

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DeviceInvalidRequestErrorSchema,
  PairedDeviceSchema,
  RefreshChallengeSchema,
  RefreshedSessionSchema,
  RefreshErrorSchema,
} from '../../contract/rest-device-schemas.js';
import { DeviceRevokedErrorSchema, RateLimitErrorSchema } from '../../contract/rest-schemas.js';
import { hashRefreshToken, issuePairingCode, refreshTokens, revokeDevice } from '../../db/index.js';
import { CHALLENGE_PATH, PAIRING_PATH, REFRESH_PATH } from '../app.js';
import { verifyAccessToken } from '../auth/access-token.js';
import { refreshSignatureMessage } from '../auth/refresh-exchange.js';
import { createTestApp, type TestApp } from './harness.js';

import type { KeyObject } from 'node:crypto';

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

interface Handset {
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  privateKey: KeyObject;
}

/** Walk the real pairing route, so the tokens under test are ones bfm minted. */
async function pair(app: TestApp): Promise<Handset> {
  const { code } = issuePairingCode(app.db);
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  const res = await request(app.app)
    .post(PAIRING_PATH)
    .send({
      code,
      publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      deviceName: "Joao's iPhone",
      deviceModel: 'iPhone17,1',
    });

  expect(res.status).toBe(201);
  const paired = PairedDeviceSchema.parse(res.body);
  return { ...paired, privateKey };
}

async function challenge(app: TestApp): Promise<string> {
  const res = await request(app.app).post(CHALLENGE_PATH).send({});
  expect(res.status).toBe(201);
  return RefreshChallengeSchema.parse(res.body).nonce;
}

function signRefresh(nonce: string, refreshToken: string, privateKey: KeyObject): string {
  return sign('sha256', refreshSignatureMessage(nonce, hashRefreshToken(refreshToken)), {
    key: privateKey,
    dsaEncoding: 'der',
  }).toString('base64');
}

/** Fetch a nonce, sign it, post the refresh. What the app does every ten minutes. */
async function refresh(app: TestApp, handset: Pick<Handset, 'refreshToken' | 'privateKey'>) {
  const nonce = await challenge(app);
  return request(app.app)
    .post(REFRESH_PATH)
    .send({
      refreshToken: handset.refreshToken,
      nonce,
      signature: signRefresh(nonce, handset.refreshToken, handset.privateKey),
    });
}

function silenceWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

describe('POST /devices/challenge', () => {
  it('mints a nonce without any credential at all', async () => {
    const app = open();

    const res = await request(app.app).post(CHALLENGE_PATH).send({});

    expect(res.status).toBe(201);
    const body = RefreshChallengeSchema.parse(res.body);
    expect(body.nonce).not.toBe('');
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  it('mints a different nonce every time', async () => {
    const app = open();

    const drawn = new Set(await Promise.all([challenge(app), challenge(app), challenge(app)]));

    expect(drawn.size).toBe(3);
  });

  it('answers the 400 its contract declares when the body is not an object', async () => {
    // The route reads nothing from the body, but `z.object({}).optional()`
    // still rejects a JSON array — so the status is reachable, and the
    // contract has to describe it or the generated client cannot decode it.
    const app = open();

    const res = await request(app.app)
      .post(CHALLENGE_PATH)
      .set('content-type', 'application/json')
      .send('[1,2]');

    expect(res.status).toBe(400);
    expect(DeviceInvalidRequestErrorSchema.parse(res.body).code).toBe('invalid_request');
  });

  it('is refused once the shared budget is spent', async () => {
    const app = open({ refreshRateLimit: { globalLimit: 2, perClientLimit: 2 } });
    await challenge(app);
    await challenge(app);

    const res = await request(app.app).post(CHALLENGE_PATH).send({});

    expect(res.status).toBe(429);
    expect(RateLimitErrorSchema.parse(res.body).retryAfterSeconds).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBe(
      String(RateLimitErrorSchema.parse(res.body).retryAfterSeconds)
    );
  });
});

describe('POST /devices/refresh', () => {
  it('rotates, and the access token it returns opens the mobile perimeter', async () => {
    const app = open();
    const handset = await pair(app);

    const res = await refresh(app, handset);

    expect(res.status).toBe(200);
    const session = RefreshedSessionSchema.parse(res.body);
    expect(verifyAccessToken(session.accessToken, app.accessTokenSigningKey).sub).toBe(
      handset.deviceId
    );
    expect(session.refreshToken).not.toBe(handset.refreshToken);
    // The successor is usable in turn — a chain, not a one-off.
    const again = await refresh(app, { ...handset, refreshToken: session.refreshToken });
    expect(again.status).toBe(200);
  });

  it('never returns a refresh token in a form the database could reproduce', async () => {
    const app = open();
    const handset = await pair(app);

    const res = await refresh(app, handset);

    const session = RefreshedSessionSchema.parse(res.body);
    const stored = app.db.select().from(refreshTokens).all();
    expect(stored.map((row) => row.tokenHash)).toContain(hashRefreshToken(session.refreshToken));
    expect(JSON.stringify(stored)).not.toContain(session.refreshToken);
  });

  it('answers 401 challenge_expired for a nonce that was never issued', async () => {
    const app = open();
    const handset = await pair(app);

    const res = await request(app.app)
      .post(REFRESH_PATH)
      .send({
        refreshToken: handset.refreshToken,
        nonce: 'a-nonce-this-server-never-drew',
        signature: signRefresh(
          'a-nonce-this-server-never-drew',
          handset.refreshToken,
          handset.privateKey
        ),
      });

    expect(res.status).toBe(401);
    expect(RefreshErrorSchema.parse(res.body).code).toBe('challenge_expired');
  });

  it('answers 401 invalid_grant for a signature from the wrong key', async () => {
    const app = open();
    const handset = await pair(app);
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;

    const res = await refresh(app, { refreshToken: handset.refreshToken, privateKey: impostor });

    expect(res.status).toBe(401);
    expect(RefreshErrorSchema.parse(res.body).code).toBe('invalid_grant');
  });

  it('sends the challenge RFC 9110 requires on a 401', async () => {
    // A 401 without `WWW-Authenticate` is non-conforming, and unlike the
    // pairing route this one has an honest scheme to name: the credential it
    // refused is a bearer token, carried in the body as RFC 6750 §2.2 allows.
    const app = open();
    const handset = await pair(app);
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;

    const rejected = await refresh(app, {
      refreshToken: handset.refreshToken,
      privateKey: impostor,
    });
    const staleChallenge = await request(app.app).post(REFRESH_PATH).send({
      refreshToken: handset.refreshToken,
      nonce: 'never-issued',
      signature: 'bm90LWEtc2lnbmF0dXJl',
    });

    // Both 401 codes, not just one.
    expect(rejected.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    expect(staleChallenge.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
  });

  it('sends no challenge on the statuses that are not 401', async () => {
    const app = open();
    const handset = await pair(app);
    revokeDevice(app.db, handset.deviceId);

    const revoked = await refresh(app, handset);
    const ok = await request(app.app).post(CHALLENGE_PATH).send({});

    expect(revoked.headers['www-authenticate']).toBeUndefined();
    expect(ok.headers['www-authenticate']).toBeUndefined();
  });

  it('answers 401 invalid_grant for a token nobody issued, in the same words', async () => {
    // Byte-identical to the wrong-signature refusal above. A response that told
    // them apart would answer "does this token exist" for whoever asked.
    const app = open();
    const handset = await pair(app);
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    const wrongSignature = await refresh(app, {
      refreshToken: handset.refreshToken,
      privateKey: impostor,
    });

    const unknownToken = await refresh(app, {
      refreshToken: 'a-token-from-another-deployment',
      privateKey: handset.privateKey,
    });

    expect(unknownToken.status).toBe(wrongSignature.status);
    expect(unknownToken.body).toEqual(wrongSignature.body);
  });

  it('answers 403 device_revoked once an operator has cut the handset off', async () => {
    const app = open();
    const handset = await pair(app);
    revokeDevice(app.db, handset.deviceId);

    const res = await refresh(app, handset);

    // 403, not 401. The app wipes its keychain on one of these and not the
    // other, and `SessionReducer` has no way to guess which.
    expect(res.status).toBe(403);
    expect(DeviceRevokedErrorSchema.parse(res.body).code).toBe('device_revoked');
  });

  it('answers 400 without naming the fields it rejected', async () => {
    const app = open();

    const res = await request(app.app).post(REFRESH_PATH).send({ refreshToken: 'only-this' });

    expect(res.status).toBe(400);
    expect(DeviceInvalidRequestErrorSchema.parse(res.body).code).toBe('invalid_request');
    // ts-rest's native body names this server's schema fields, on a route
    // reachable from the public internet. `rest/request-validation.ts` is what
    // stops that reaching the wire.
    expect(JSON.stringify(res.body)).not.toContain('signature');
    expect(JSON.stringify(res.body)).not.toContain('nonce');
  });

  it('is refused once the shared budget is spent, before it reads the body', async () => {
    const app = open({ refreshRateLimit: { globalLimit: 1, perClientLimit: 1 } });

    // The challenge spends the only unit, so the refresh below never reaches
    // the exchange — one budget across both routes, not one each.
    await challenge(app);
    const res = await request(app.app).post(REFRESH_PATH).send({ nonsense: true });

    expect(res.status).toBe(429);
    expect(RateLimitErrorSchema.safeParse(res.body).success).toBe(true);
  });
});

describe('reuse detection, over the wire', () => {
  it('burns the family when a spent token comes back, and the successor stops working', async () => {
    silenceWarnings();
    const app = open();
    const handset = await pair(app);
    const first = RefreshedSessionSchema.parse((await refresh(app, handset)).body);

    const replay = await refresh(app, handset);

    expect(replay.status).toBe(401);
    expect(RefreshErrorSchema.parse(replay.body).code).toBe('invalid_grant');
    const successor = await refresh(app, { ...handset, refreshToken: first.refreshToken });
    expect(successor.status).toBe(401);
  });

  it('does not resurrect the family on a later honest attempt', async () => {
    silenceWarnings();
    const app = open();
    const handset = await pair(app);
    await refresh(app, handset);
    await refresh(app, handset);

    const stored = app.db.select().from(refreshTokens).all();

    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it('leaves a second handset able to refresh', async () => {
    silenceWarnings();
    const app = open();
    const mine = await pair(app);
    const theirs = await pair(app);
    await refresh(app, mine);
    await refresh(app, mine);

    expect((await refresh(app, theirs)).status).toBe(200);
  });
});

describe('two requests racing one refresh token', () => {
  it('lets exactly one through', async () => {
    // The braces to the phone's single-flight belt. Both requests hold their
    // own nonce and the same token, and they are issued without awaiting
    // between them.
    silenceWarnings();
    const app = open();
    const handset = await pair(app);
    const [firstNonce, secondNonce] = await Promise.all([challenge(app), challenge(app)]);

    const results = await Promise.all(
      [firstNonce, secondNonce].map((nonce) =>
        request(app.app)
          .post(REFRESH_PATH)
          .send({
            refreshToken: handset.refreshToken,
            nonce,
            signature: signRefresh(nonce, handset.refreshToken, handset.privateKey),
          })
      )
    );

    const statuses = results.map((res) => res.status).sort((a, b) => a - b);
    expect(statuses).toEqual([200, 401]);
  });

  it('burns the family rather than treating the loser as a harmless retry', async () => {
    // The loser is the same evidence as a replay, observed a moment earlier:
    // one token, two presentations. Answering it any other way would leave a
    // thief able to race the honest phone indefinitely without being detected.
    silenceWarnings();
    const app = open();
    const handset = await pair(app);
    const nonces = await Promise.all([challenge(app), challenge(app)]);

    await Promise.all(
      nonces.map((nonce) =>
        request(app.app)
          .post(REFRESH_PATH)
          .send({
            refreshToken: handset.refreshToken,
            nonce,
            signature: signRefresh(nonce, handset.refreshToken, handset.privateKey),
          })
      )
    );

    expect(
      app.db
        .select()
        .from(refreshTokens)
        .all()
        .every((row) => row.revokedAt !== null)
    ).toBe(true);
  });
});
