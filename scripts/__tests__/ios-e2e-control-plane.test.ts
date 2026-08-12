import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deviceIdFrom, mintAgedAccessToken } from '../ios-e2e/aged-access-token.mjs';
import { startControlPlane } from '../ios-e2e/control-plane.mjs';

const SECRET = 'ios-e2e-access-token-secret-not-a-real-key';

/** The claims a bfm access token carries, as this test needs to read them. */
interface Claims {
  sub: string;
  iat: number;
  exp: number;
}

function segments(token: string): { header: Record<string, unknown>; claims: Claims } {
  const [header, payload] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(String(header), 'base64url').toString('utf8')),
    claims: JSON.parse(Buffer.from(String(payload), 'base64url').toString('utf8')),
  };
}

/** What `jwt.verify` checks before it looks at a single claim. */
function signatureHolds(token: string, secret: string): boolean {
  const [header, payload, signature] = token.split('.');
  const expected = createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(`${String(header)}.${String(payload)}`)
    .digest('base64url');
  return signature === expected;
}

describe('mintAgedAccessToken', () => {
  const minted = mintAgedAccessToken({
    deviceId: 'device-1',
    secret: SECRET,
    now: new Date('2026-03-03T12:00:00.000Z'),
    expiredForSeconds: 3_600,
  });

  it('is signed with the key the pillar verifies against', () => {
    // The whole point of the substitution: the token is bfm's own, not a
    // forgery it rejects for the wrong reason. A signature failure and an
    // expiry both produce 401, so nothing downstream would notice the
    // difference — this is the only place that can.
    expect(signatureHolds(minted, SECRET)).toBe(true);
    expect(signatureHolds(minted, `${SECRET}-but-different`)).toBe(false);
  });

  it('carries the header the pillar pins, so it is a bfm access token', () => {
    expect(segments(minted).header).toEqual({ alg: 'HS256', typ: 'bfm-at+jwt' });
  });

  it('expired the stated number of seconds ago, and was issued before that', () => {
    const { claims } = segments(minted);
    expect(claims.exp).toBe(Math.floor(Date.parse('2026-03-03T12:00:00.000Z') / 1000) - 3_600);
    expect(claims.iat).toBeLessThan(claims.exp);
  });

  it('speaks for the device it was asked about', () => {
    expect(segments(minted).claims.sub).toBe('device-1');
    expect(deviceIdFrom(minted)).toBe('device-1');
  });

  it('refuses to mint something that is still valid', () => {
    // A non-positive age sails through the guard, and the flow would then be
    // asserting a refresh that never had to happen.
    for (const expiredForSeconds of [0, -1]) {
      expect(() =>
        mintAgedAccessToken({ deviceId: 'd', secret: SECRET, expiredForSeconds })
      ).toThrow(/must be positive/u);
    }
  });

  it('refuses to mint a token with no device id', () => {
    expect(() => mintAgedAccessToken({ deviceId: '', secret: SECRET })).toThrow(/no device id/u);
  });
});

describe('deviceIdFrom', () => {
  it('reads a subject without verifying anything', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'device-9' }), 'utf8').toString('base64url');
    expect(deviceIdFrom(`header.${payload}.signature`)).toBe('device-9');
  });

  it('answers null rather than throwing on anything it cannot read', () => {
    const noSub = Buffer.from(JSON.stringify({ nope: 1 }), 'utf8').toString('base64url');
    const emptySub = Buffer.from(JSON.stringify({ sub: '' }), 'utf8').toString('base64url');
    expect(deviceIdFrom('not-a-token')).toBeNull();
    expect(deviceIdFrom('header.@@@notbase64@@@.signature')).toBeNull();
    expect(deviceIdFrom(`header.${noSub}.signature`)).toBeNull();
    expect(deviceIdFrom(`header.${emptySub}.signature`)).toBeNull();
  });
});

/** One request as the pretend BFM saw it. */
interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}

describe('the control plane', () => {
  let bfm: Server;
  let seen: Seen[];
  let outage: boolean;
  let control: Awaited<ReturnType<typeof startControlPlane>>;

  beforeEach(async () => {
    seen = [];
    outage = false;

    bfm = createServer((request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        seen.push({
          method: String(request.method),
          url: String(request.url),
          authorization: request.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(201, { 'content-type': 'application/json', 'x-from': 'bfm' });
        response.end(JSON.stringify({ answered: request.url }));
      });
    });
    await new Promise<void>((resolve) => bfm.listen(0, '127.0.0.1', resolve));

    const address = bfm.address();
    if (address === null || typeof address === 'string') throw new Error('no address');

    control = await startControlPlane({
      bfmBaseUrl: `http://127.0.0.1:${String(address.port)}`,
      accessTokenSecret: SECRET,
      upstream: {
        setFinanceOutage: (active: boolean) => {
          outage = active;
        },
        isFinanceOutage: () => outage,
      },
    });
  });

  afterEach(async () => {
    await control.close();
    await new Promise<void>((resolve) => bfm.close(() => resolve()));
  });

  const call = (path: string, init?: RequestInit) => fetch(`${control.url}${path}`, init);
  const arm = () => call('/__e2e/access-token/expire-next', { method: 'POST' });
  const bearer = (deviceId: string) =>
    `Bearer ${mintAgedAccessToken({ deviceId, secret: SECRET, expiredForSeconds: 1 })}`;

  it('forwards method, path, query and body, and hands the answer back', async () => {
    const answered = await call('/mobile/finance/transactions?cursor=abc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"hello":"bfm"}',
    });

    expect(answered.status).toBe(201);
    expect(answered.headers.get('x-from')).toBe('bfm');
    expect(await answered.json()).toEqual({ answered: '/mobile/finance/transactions?cursor=abc' });
    expect(seen).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/mobile/finance/transactions?cursor=abc',
        body: '{"hello":"bfm"}',
      }),
    ]);
  });

  it('keeps its own routes to itself', async () => {
    expect(await (await call('/__e2e/state')).json()).toEqual({
      armed: false,
      substitutions: 0,
      refreshes: 0,
      lastDeviceId: null,
      financeOutage: false,
    });
    expect(seen).toEqual([]);
  });

  it('names the device on the most recent authenticated request', async () => {
    // How the revocation flow knows which handset to cut off. Every flow pairs
    // from scratch against one database, so the operator's list holds several
    // live devices by the third one and "the only one" is not an answer.
    await call('/mobile/bootstrap', { headers: { authorization: bearer('device-7') } });
    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ lastDeviceId: 'device-7' })
    );

    // Not moved by a route that carries no credential, and not unset by one.
    await call('/devices/refresh', { method: 'POST', body: '{}' });
    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ lastDeviceId: 'device-7' })
    );
  });

  it('puts everything back on reset, including the switch a failed flow left thrown', async () => {
    // The lane calls this between flows. Without the finance half, a flow that
    // died mid-outage would hand the next one a pillar that refuses
    // everything, and that flow would fail for the previous one's reason.
    await call('/__e2e/finance/down', { method: 'POST' });
    await arm();
    await call('/mobile/bootstrap', { headers: { authorization: bearer('device-1') } });
    await call('/devices/refresh', { method: 'POST', body: '{}' });

    expect(await (await call('/__e2e/reset', { method: 'POST' })).json()).toEqual({
      armed: false,
      substitutions: 0,
      refreshes: 0,
      lastDeviceId: null,
      financeOutage: false,
    });
    expect(outage).toBe(false);
  });

  it('names an unknown control route rather than forwarding it', async () => {
    // Forwarded, a typo in a flow 404s at the BFM and reads as the pillar
    // having lost a route.
    const answered = await call('/__e2e/nonsense', { method: 'POST' });
    expect(answered.status).toBe(404);
    expect((await answered.json()).routes).toContain('GET /__e2e/state');
    expect(seen).toEqual([]);
  });

  it('ages exactly one authenticated request once armed', async () => {
    const own = bearer('device-1');
    await arm();
    await call('/mobile/bootstrap', { headers: { authorization: own } });
    await call('/mobile/bootstrap', { headers: { authorization: own } });

    const [substituted, untouched] = seen;
    expect(substituted?.authorization).not.toBe(own);
    expect(untouched?.authorization).toBe(own);

    // Same device, still bfm's own signature: the pillar rejects it for the
    // one reason this flow is about.
    const swapped = String(substituted?.authorization).replace(/^Bearer /u, '');
    expect(deviceIdFrom(swapped)).toBe('device-1');
    expect(signatureHolds(swapped, SECRET)).toBe(true);
    expect(segments(swapped).claims.exp).toBeLessThan(Math.floor(Date.now() / 1000));

    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ armed: false, substitutions: 1 })
    );
  });

  it('does not spend the arming on a route that carries no credential', async () => {
    // `AuthenticatingMiddleware` strips the header off everything outside
    // `/mobile/`, so a substitution there would age a token nobody sent and
    // leave the request the flow cares about untouched.
    await arm();
    await call('/devices/challenge', { method: 'POST' });
    await call('/health');

    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ armed: true, substitutions: 0 })
    );
  });

  it('leaves a request it cannot age alone, and says it spent nothing', async () => {
    // Reported rather than papered over: substituting something invented would
    // still produce a 401, but for a reason the flow is not testing.
    await arm();
    await call('/mobile/bootstrap', { headers: { authorization: 'Bearer not-a-jwt' } });

    expect(seen[0]?.authorization).toBe('Bearer not-a-jwt');
    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ armed: true, substitutions: 0 })
    );
  });

  it('counts the refreshes that go past it', async () => {
    await call('/devices/refresh', { method: 'POST', body: '{}' });
    await call('/devices/refresh', { method: 'POST', body: '{}' });
    // A GET is not a refresh, and neither is the challenge that precedes one.
    await call('/devices/refresh');
    await call('/devices/challenge', { method: 'POST' });

    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ refreshes: 2 })
    );
  });

  it('throws the finance switch both ways', async () => {
    expect(await (await call('/__e2e/finance/down', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ financeOutage: true })
    );
    expect(outage).toBe(true);

    expect(await (await call('/__e2e/finance/up', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ financeOutage: false })
    );
    expect(outage).toBe(false);
  });

  it('reports a BFM it cannot reach as its own failure', async () => {
    await new Promise<void>((resolve) => bfm.close(() => resolve()));

    const answered = await call('/mobile/bootstrap');
    expect(answered.status).toBe(502);
    expect((await answered.json()).message).toMatch(/control plane could not reach the BFM/u);
  });
});
