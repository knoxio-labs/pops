import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { connect } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deviceIdFrom, mintAgedAccessToken } from '../ios-e2e/aged-access-token.mjs';
import { startControlPlane } from '../ios-e2e/control-plane.mjs';
import { createPairingHandoff } from '../ios-e2e/pairing-handoff.mjs';
import { startPurchasesStub } from '../ios-e2e/purchases-stub.mjs';

const SECRET = 'ios-e2e-access-token-secret-not-a-real-key';
const SIMULATOR_ID = '11111111-1111-4111-8111-111111111111';

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

/**
 * One request line, sent down a socket, because `fetch` refuses to produce the
 * request targets this needs to test.
 */
function rawRequest(baseUrl: string, requestLine: string): Promise<string> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port) }, () => {
      socket.write(`${requestLine}\r\nHost: ${hostname}:${port}\r\nConnection: close\r\n\r\n`);
    });
    let answer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => (answer += chunk));
    socket.on('error', reject);
    socket.on('end', () => resolve(answer));
  });
}

/** One request as the pretend BFM saw it. */
interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}

interface PairingDeliveryRequest {
  deviceId: string;
  pairingBaseUrl: string;
  brokerUrl: string;
}

describe('the control plane', () => {
  let bfm: Server;
  let seen: Seen[];
  let outage: boolean;
  let openApiUnreachable: boolean;
  let contractMismatch: boolean;
  let purchases: Awaited<ReturnType<typeof startPurchasesStub>>;
  let inventoryReachable: boolean;
  let inventorySyncOutage: boolean;
  let publishUserDefinedType: () => Promise<Record<string, unknown>>;
  let pairingDelivery: (options: PairingDeliveryRequest) => Promise<number>;
  let pairingHandoff: ReturnType<typeof createPairingHandoff>;
  let control: Awaited<ReturnType<typeof startControlPlane>>;

  beforeEach(async () => {
    seen = [];
    outage = false;
    openApiUnreachable = false;
    contractMismatch = false;
    purchases = await startPurchasesStub();
    inventoryReachable = false;
    inventorySyncOutage = false;
    publishUserDefinedType = () => Promise.resolve({ typeId: 'type-1', revision: 2 });
    pairingDelivery = async () => 1;
    pairingHandoff = createPairingHandoff({ deviceId: SIMULATOR_ID });

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
        setFinanceOpenApiUnreachable: (active: boolean) => {
          openApiUnreachable = active;
        },
        isFinanceOpenApiUnreachable: () => openApiUnreachable,
        setFinanceContractMismatch: (active: boolean) => {
          contractMismatch = active;
        },
        isFinanceContractMismatch: () => contractMismatch,
      },
      purchases,
      simulatorDeviceId: SIMULATOR_ID,
      pairingHandoff,
      pairSimulator: (options) => pairingDelivery(options),
      inventory: {
        setReachable: (active: boolean) => {
          inventoryReachable = active;
        },
        isReachable: () => inventoryReachable,
        setSyncOutage: (active: boolean) => {
          inventorySyncOutage = active;
        },
        isSyncOutage: () => inventorySyncOutage,
        publishUserDefinedType: () => publishUserDefinedType(),
      },
    });
  });

  afterEach(async () => {
    await control.close();
    await purchases.close();
    await new Promise<void>((resolve) => bfm.close(() => resolve()));
  });

  const call = (path: string, init?: RequestInit) => fetch(`${control.url}${path}`, init);
  const arm = () => call('/__e2e/access-token/expire-next', { method: 'POST' });
  const bearer = (deviceId: string) =>
    `Bearer ${mintAgedAccessToken({ deviceId, secret: SECRET, expiredForSeconds: 1 })}`;

  it('acknowledges trigger dispatch separately from stored-session completion', async () => {
    const deviceId = SIMULATOR_ID;
    const code = '7QK4-9M2X-P3ND';
    let generation = 0;
    const deliver = vi.fn(async ({ deviceId, pairingBaseUrl }: PairingDeliveryRequest) => {
      generation = pairingHandoff.offer({
        deviceId,
        pairingBaseUrl,
        code,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      return 0;
    });
    pairingDelivery = deliver;

    const response = await call('/__e2e/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, pairingBaseUrl: control.url }),
    });
    const body = await response.text();

    expect(response.status).toBe(202);
    expect(body).toBe('{"triggerDispatched":true}');
    expect(body).not.toContain(code);
    expect(pairingHandoff.readCounts()).toEqual({ claims: 0, completions: 0, paired: 0 });
    expect(deliver).toHaveBeenCalledWith({
      deviceId,
      pairingBaseUrl: control.url,
      brokerUrl: control.url,
    });

    const status = call('/__e2e/pair/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const metadata = { deviceId, instanceId: pairingHandoff.instanceId, generation };
    const claim = await call('/__e2e/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    expect(claim.status).toBe(200);
    expect(await claim.text()).toContain(code);
    const completion = await call('/__e2e/pair/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...metadata, paired: true }),
    });
    expect(completion.status).toBe(204);
    const statusResponse = await status;
    const statusBody = await statusResponse.text();

    expect(statusResponse.status).toBe(200);
    expect(statusBody).toBe('{"paired":true}');
    expect(statusBody).not.toContain(code);
    expect(seen).toEqual([]);
  });

  it('does not report success when the app fails to store its session', async () => {
    const deviceId = SIMULATOR_ID;
    const code = '7QK4-9M2X-P3ND';
    let generation = 0;
    pairingDelivery = async ({ deviceId, pairingBaseUrl }: PairingDeliveryRequest) => {
      generation = pairingHandoff.offer({
        deviceId,
        pairingBaseUrl,
        code,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      return 0;
    };

    const dispatched = await call('/__e2e/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, pairingBaseUrl: control.url }),
    });
    expect(dispatched.status).toBe(202);

    const metadata = { deviceId, instanceId: pairingHandoff.instanceId, generation };
    const claim = await call('/__e2e/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    expect(claim.status).toBe(200);
    const completion = await call('/__e2e/pair/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...metadata, paired: false }),
    });
    expect(completion.status).toBe(204);
    const response = await call('/__e2e/pair/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe('{"message":"ios-e2e simulator did not store a session for this BFM."}');
    expect(body).not.toContain(code);
  });

  it('rejects a pairing-status request for any simulator other than the selected one', async () => {
    const response = await call('/__e2e/pair/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: '22222222-2222-4222-8222-222222222222' }),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      '{"message":"ios-e2e native pairing status request is invalid."}'
    );
  });

  it('claims one pairing code only for the exact simulator and current generation without forwarding it', async () => {
    const code = '7QK4-9M2X-P3ND';
    const generation = pairingHandoff.offer({
      deviceId: SIMULATOR_ID,
      pairingBaseUrl: control.url,
      code,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const wrongDevice = await call('/__e2e/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: '22222222-2222-4222-8222-222222222222',
        instanceId: pairingHandoff.instanceId,
        generation,
      }),
    });
    const staleGeneration = await call('/__e2e/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: SIMULATOR_ID,
        instanceId: pairingHandoff.instanceId,
        generation: generation + 1,
      }),
    });
    const accepted = await call('/__e2e/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: SIMULATOR_ID,
        instanceId: pairingHandoff.instanceId,
        generation,
      }),
    });
    const acceptedBody = await accepted.text();
    const replay = await call('/__e2e/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: SIMULATOR_ID,
        instanceId: pairingHandoff.instanceId,
        generation,
      }),
    });

    expect(wrongDevice.status).toBe(409);
    expect(await wrongDevice.text()).not.toContain(code);
    expect(staleGeneration.status).toBe(409);
    expect(await staleGeneration.text()).not.toContain(code);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get('cache-control')).toBe('no-store');
    expect(acceptedBody).toContain(code);
    expect(replay.status).toBe(409);
    expect(await replay.text()).not.toContain(code);
    expect(seen).toEqual([]);
  });

  it('rejects malformed, mismatched, or non-local pairing requests without reflecting values', async () => {
    const secret = 'SYNTHETIC-PAIR-CODE';
    const deliver = vi.fn(async () => 0);
    pairingDelivery = deliver;
    const requests = [
      'not-json',
      JSON.stringify({ deviceId: 'invalid', pairingBaseUrl: control.url }),
      JSON.stringify({
        deviceId: '------------------------------------',
        pairingBaseUrl: control.url,
      }),
      JSON.stringify({
        deviceId: '22222222-2222-4222-8222-222222222222',
        pairingBaseUrl: control.url,
      }),
      JSON.stringify({
        deviceId: SIMULATOR_ID,
        pairingBaseUrl: `https://outside.example/devices/pair?code=${secret}`,
      }),
    ];

    for (const body of requests) {
      const response = await call('/__e2e/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      const message = await response.text();

      expect(response.status).toBe(400);
      expect(message).toBe('{"message":"ios-e2e native pairing request is invalid."}');
      expect(message).not.toContain(secret);
    }

    expect(deliver).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('does not return pairing material when issuance fails', async () => {
    const secret = 'SYNTHETIC-PAIR-CODE';
    pairingDelivery = async () => {
      throw new Error(`simctl failure included ${secret}`);
    };

    const response = await call('/__e2e/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: SIMULATOR_ID,
        pairingBaseUrl: control.url,
      }),
    });
    const message = await response.text();

    expect(response.status).toBe(502);
    expect(message).toBe(
      '{"message":"ios-e2e native pairing failed; issuance status is unknown."}'
    );
    expect(message).not.toContain(secret);
    expect(seen).toEqual([]);
  });

  it('reports link-delivery failure without claiming pairing succeeded', async () => {
    pairingDelivery = async () => 7;

    const response = await call('/__e2e/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: SIMULATOR_ID,
        pairingBaseUrl: control.url,
      }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: 'ios-e2e native pairing link delivery failed.',
    });
    expect(seen).toEqual([]);
  });

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
      bootstrapFailures: 0,
      bootstrapFailureArmed: false,
      bootstrapOutage: false,
      financeOutage: false,
      financeOpenApiUnreachable: false,
      financeContractMismatch: false,
      purchasesReachable: false,
      purchasesSearchOutage: false,
      inventoryReachable: false,
      inventorySyncOutage: false,
    });
    expect(seen).toEqual([]);
  });

  it('resets manual purchases between flows without changing the seeded history or search', async () => {
    const list = async () => (await fetch(`${purchases.url}/purchases`)).json();
    const search = async () =>
      (
        await fetch(`${purchases.url}/search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: { text: 'Corner Store' } }),
        })
      ).json();
    const baselineList = await list();
    const baselineSearch = await search();
    expect(baselineList.total).toBe(3);
    expect(baselineSearch.hits).toHaveLength(1);

    for (let flow = 0; flow < 2; flow++) {
      const createdResponse = await fetch(`${purchases.url}/purchases/manual`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ merchantEntityName: 'Corner Store', totalCents: 500 }),
      });
      expect(createdResponse.status).toBe(200);
      const created = await createdResponse.json();
      expect((await list()).total).toBe(4);
      expect((await search()).hits).toHaveLength(2);

      expect((await call('/__e2e/reset', { method: 'POST' })).status).toBe(200);
      expect(await list()).toEqual(baselineList);
      expect(await search()).toEqual(baselineSearch);
      expect(
        (await fetch(`${purchases.url}/purchases/${String(created.purchase.id)}`)).status
      ).toBe(404);
    }
    expect((await call('/__e2e/reset', { method: 'POST' })).status).toBe(200);
    expect(await list()).toEqual(baselineList);
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

  it('fails exactly the next bootstrap request without forwarding it', async () => {
    const armed = await call('/__e2e/bootstrap/fail-next', { method: 'POST' });
    expect(armed.status).toBe(200);
    expect(await armed.json()).toEqual(expect.objectContaining({ bootstrapFailureArmed: true }));

    const failed = await call('/mobile/bootstrap');
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ message: 'ios-e2e bootstrap failure' });
    expect(seen).toEqual([]);

    const forwarded = await call('/mobile/bootstrap');
    expect(forwarded.status).toBe(201);
    expect(seen).toHaveLength(1);
    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ bootstrapFailures: 1, bootstrapFailureArmed: false })
    );
  });

  it('holds bootstrap unavailable until the outage is cleared', async () => {
    const outage = await call('/__e2e/bootstrap/down', { method: 'POST' });
    expect(outage.status).toBe(200);
    expect(await outage.json()).toEqual(expect.objectContaining({ bootstrapOutage: true }));

    for (let attempt = 0; attempt < 2; attempt++) {
      const failed = await call('/mobile/bootstrap');
      expect(failed.status).toBe(503);
      expect(await failed.json()).toEqual({ message: 'ios-e2e bootstrap failure' });
    }
    expect(seen).toEqual([]);

    const recovery = await call('/__e2e/bootstrap/up', { method: 'POST' });
    expect(await recovery.json()).toEqual(expect.objectContaining({ bootstrapOutage: false }));
    expect((await call('/mobile/bootstrap')).status).toBe(201);
    expect(seen).toHaveLength(1);
    expect(await (await call('/__e2e/state')).json()).toEqual(
      expect.objectContaining({ bootstrapFailures: 2, bootstrapOutage: false })
    );
  });

  it('puts everything back on reset, including the switch a failed flow left thrown', async () => {
    // The lane calls this between flows. Without the finance half, a flow that
    // died mid-outage would hand the next one a pillar that refuses
    // everything, and that flow would fail for the previous one's reason.
    await call('/__e2e/finance/down', { method: 'POST' });
    await call('/__e2e/finance/openapi-unreachable', { method: 'POST' });
    await call('/__e2e/finance/contract-mismatch', { method: 'POST' });
    await call('/__e2e/purchases/up', { method: 'POST' });
    await call('/__e2e/purchases/search-down', { method: 'POST' });
    await call('/__e2e/inventory/up', { method: 'POST' });
    await call('/__e2e/inventory/sync-down', { method: 'POST' });
    await call('/__e2e/bootstrap/down', { method: 'POST' });
    await call('/__e2e/bootstrap/fail-next', { method: 'POST' });
    await call('/mobile/bootstrap');
    await call('/__e2e/bootstrap/fail-next', { method: 'POST' });
    await arm();
    await call('/mobile/bootstrap', { headers: { authorization: bearer('device-1') } });
    await call('/devices/refresh', { method: 'POST', body: '{}' });

    const pairingGeneration = pairingHandoff.offer({
      deviceId: SIMULATOR_ID,
      pairingBaseUrl: control.url,
      code: '7QK4-9M2X-P3ND',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(await (await call('/__e2e/reset', { method: 'POST' })).json()).toEqual({
      armed: false,
      substitutions: 0,
      refreshes: 0,
      lastDeviceId: null,
      bootstrapFailures: 0,
      bootstrapFailureArmed: false,
      bootstrapOutage: false,
      financeOutage: false,
      financeOpenApiUnreachable: false,
      financeContractMismatch: false,
      purchasesReachable: false,
      purchasesSearchOutage: false,
      inventoryReachable: false,
      inventorySyncOutage: false,
    });
    expect(
      pairingHandoff.claim({
        deviceId: SIMULATOR_ID,
        instanceId: pairingHandoff.instanceId,
        generation: pairingGeneration,
      })
    ).toBeNull();
    expect(outage).toBe(false);
    expect(openApiUnreachable).toBe(false);
    expect(contractMismatch).toBe(false);
    // Withheld again, so the next flow meets the single-feature root every
    // flow written before `receipt-capture` existed was written against.
    expect(purchases.isReachable()).toBe(false);
    expect(purchases.isSearchOutage()).toBe(false);
    expect(inventoryReachable).toBe(false);
    expect(inventorySyncOutage).toBe(false);
  });

  it('refuses a target that could resolve to another host', async () => {
    // HTTP/1.1 addresses a proxy in absolute form, and `//host/x` is
    // protocol-relative. Either one, resolved against the BFM's origin, leaves
    // with the phone's bearer token attached and arrives somewhere nobody here
    // chose. Sent down a raw socket because `fetch` will not produce them.
    const answers = await Promise.all(
      ['GET http://127.0.0.1:1/stolen HTTP/1.1', 'GET //127.0.0.1:1/stolen HTTP/1.1'].map((line) =>
        rawRequest(control.url, line)
      )
    );

    for (const answer of answers) expect(answer).toContain('400 Bad Request');
    expect(seen).toEqual([]);
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

  it('throws the root-unreachable switch both ways', async () => {
    expect(
      await (await call('/__e2e/finance/openapi-unreachable', { method: 'POST' })).json()
    ).toEqual(expect.objectContaining({ financeOpenApiUnreachable: true }));
    expect(openApiUnreachable).toBe(true);

    expect(
      await (await call('/__e2e/finance/openapi-reachable', { method: 'POST' })).json()
    ).toEqual(expect.objectContaining({ financeOpenApiUnreachable: false }));
    expect(openApiUnreachable).toBe(false);
  });

  it('throws the contract-mismatch switch both ways', async () => {
    expect(
      await (await call('/__e2e/finance/contract-mismatch', { method: 'POST' })).json()
    ).toEqual(expect.objectContaining({ financeContractMismatch: true }));
    expect(contractMismatch).toBe(true);

    expect(await (await call('/__e2e/finance/contract-ok', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ financeContractMismatch: false })
    );
    expect(contractMismatch).toBe(false);
  });

  it('throws the receipt-capture switch both ways', async () => {
    // `purchases` reachable is what puts a second tab on the root screen —
    // `ContentView` draws a `TabView` only at two or more usable features — so
    // this switch is the difference between a flow that can reach the receipt
    // screen and one that cannot.
    expect(await (await call('/__e2e/purchases/up', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ purchasesReachable: true })
    );
    expect(purchases.isReachable()).toBe(true);

    expect(await (await call('/__e2e/purchases/down', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ purchasesReachable: false })
    );
    expect(purchases.isReachable()).toBe(false);
  });

  it('throws the purchases search outage both ways, independent of reachability', async () => {
    expect(await (await call('/__e2e/purchases/search-down', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ purchasesSearchOutage: true, purchasesReachable: false })
    );
    expect(purchases.isSearchOutage()).toBe(true);

    expect(await (await call('/__e2e/purchases/search-up', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ purchasesSearchOutage: false })
    );
    expect(purchases.isSearchOutage()).toBe(false);
  });

  it('throws the inventory sync outage both ways', async () => {
    expect(await (await call('/__e2e/inventory/sync-down', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ inventorySyncOutage: true })
    );
    expect(inventorySyncOutage).toBe(true);
    expect(await (await call('/__e2e/inventory/sync-up', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ inventorySyncOutage: false })
    );
    expect(inventorySyncOutage).toBe(false);
    expect(seen).toEqual([]);
  });

  it('throws the inventory switch both ways', async () => {
    // Reachable is what makes the BFM name `inventory` usable, so only the
    // Inventory flow meets an Inventory tab.
    expect(await (await call('/__e2e/inventory/up', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ inventoryReachable: true })
    );
    expect(inventoryReachable).toBe(true);

    expect(await (await call('/__e2e/inventory/down', { method: 'POST' })).json()).toEqual(
      expect.objectContaining({ inventoryReachable: false })
    );
    expect(inventoryReachable).toBe(false);
  });

  it('publishes the user-defined type itself and answers what was published', async () => {
    const answered = await call('/__e2e/inventory/user-defined-type', { method: 'POST' });
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual(
      expect.objectContaining({ userDefinedType: { typeId: 'type-1', revision: 2 } })
    );
    expect(seen).toEqual([]);
  });

  it('reports a publication that failed as its own failure, not a pillar answer', async () => {
    publishUserDefinedType = () => Promise.reject(new Error('rollout refused'));
    const answered = await call('/__e2e/inventory/user-defined-type', { method: 'POST' });
    expect(answered.status).toBe(502);
    expect((await answered.json()).message).toMatch(
      /could not publish the user-defined type: Error: rollout refused/u
    );
    expect(seen).toEqual([]);
  });

  it('reports a BFM it cannot reach as its own failure', async () => {
    await new Promise<void>((resolve) => bfm.close(() => resolve()));

    const answered = await call('/mobile/bootstrap');
    expect(answered.status).toBe(502);
    expect((await answered.json()).message).toMatch(/control plane could not reach the BFM/u);
  });
});
