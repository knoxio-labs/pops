import { afterEach, describe, expect, it } from 'vitest';

import { createPairingHandoff, startPairingHandoffServer } from '../ios-e2e/pairing-handoff.mjs';

const simulatorId = '11111111-1111-4111-8111-111111111111';
const otherSimulatorId = '33333333-3333-4333-8333-333333333333';
const code = '7QK4-9M2X-P3ND';
const expiresAt = '2030-01-01T00:00:00.000Z';
const nowMs = Date.parse('2029-01-01T00:00:00.000Z');

describe('pairing handoff', () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  it('returns one-time details only for the exact selected simulator and current public generation', async () => {
    const handoff = createPairingHandoff({ deviceId: simulatorId, now: () => nowMs });
    const generation = handoff.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'http://127.0.0.1:3014',
      code,
      expiresAt,
    });
    const broker = await startPairingHandoffServer(handoff);
    closeServer = broker.close;

    const wrongDevice = await claim(broker.url, otherSimulatorId, handoff.instanceId, generation);
    const wrongInstance = await claim(broker.url, simulatorId, '12345-1800000000000-2', generation);
    const wrongGeneration = await claim(
      broker.url,
      simulatorId,
      handoff.instanceId,
      generation + 1
    );
    const accepted = await claim(broker.url, simulatorId, handoff.instanceId, generation);
    const replay = await claim(broker.url, simulatorId, handoff.instanceId, generation);

    expect(generation).toBe(1);
    expect(wrongDevice.status).toBe(409);
    expect(wrongDevice.body).not.toContain(code);
    expect(wrongInstance.status).toBe(409);
    expect(wrongInstance.body).not.toContain(code);
    expect(wrongGeneration.status).toBe(409);
    expect(wrongGeneration.body).not.toContain(code);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get('cache-control')).toBe('no-store');
    expect(accepted.headers.get('pragma')).toBe('no-cache');
    expect(accepted.json).toEqual({
      deviceId: simulatorId,
      instanceId: handoff.instanceId,
      generation,
      pairingBaseUrl: 'http://127.0.0.1:3014',
      code,
      expiresAt,
    });
    expect(replay.status).toBe(409);
    expect(replay.body).not.toContain(code);
  });

  it('rejects malformed, oversized, and non-POST claims without exposing the pending code', async () => {
    const handoff = createPairingHandoff({ deviceId: simulatorId, now: () => nowMs });
    const generation = handoff.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'https://bfm.example.com',
      code,
      expiresAt,
    });
    const broker = await startPairingHandoffServer(handoff);
    closeServer = broker.close;

    const method = await fetch(`${broker.url}/__e2e/pair/claim`);
    const malformed = await fetch(`${broker.url}/__e2e/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const oversized = await fetch(`${broker.url}/__e2e/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: ' '.repeat(1025),
    });
    const wrongShape = await fetch(`${broker.url}/__e2e/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: simulatorId,
        instanceId: handoff.instanceId,
        generation,
        code,
      }),
    });
    const malformedInstance = await fetch(`${broker.url}/__e2e/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: simulatorId, instanceId: 'opaque', generation }),
    });

    for (const response of [method, malformed, oversized, wrongShape, malformedInstance]) {
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).not.toContain(code);
    }
    expect(method.status).toBe(405);
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(wrongShape.status).toBe(400);
    expect(malformedInstance.status).toBe(400);
    expect((await claim(broker.url, simulatorId, handoff.instanceId, generation)).status).toBe(200);
  });

  it('rejects unsafe origins and expired code offers before storing them', () => {
    const handoff = createPairingHandoff({ deviceId: simulatorId, now: () => nowMs });
    const unsafeOrigins = [
      'http://localhost:3014',
      'http://192.0.2.1:3014',
      'https://user:password@bfm.example.com',
      'https://bfm.example.com/devices/pair?code=secret',
    ];

    for (const pairingBaseUrl of unsafeOrigins) {
      expect(() =>
        handoff.offer({ deviceId: simulatorId, pairingBaseUrl, code, expiresAt })
      ).toThrow('ios-e2e pairing handoff is invalid.');
    }
    expect(() =>
      handoff.offer({
        deviceId: otherSimulatorId,
        pairingBaseUrl: 'https://bfm.example.com',
        code,
        expiresAt,
      })
    ).toThrow('ios-e2e pairing handoff is invalid.');
    expect(() =>
      handoff.offer({
        deviceId: simulatorId,
        pairingBaseUrl: 'https://bfm.example.com',
        code,
        expiresAt: '2028-01-01T00:00:00.000Z',
      })
    ).toThrow('ios-e2e pairing handoff is expired.');
  });

  it('expires and resets pending offers, releasing claim waiters as failures', async () => {
    let now = nowMs;
    const handoff = createPairingHandoff({ deviceId: simulatorId, now: () => now });
    const generation = handoff.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'https://bfm.example.com',
      code,
      expiresAt: new Date(nowMs + 2_000).toISOString(),
    });
    const broker = await startPairingHandoffServer(handoff);
    closeServer = broker.close;

    const waiting = handoff.waitForClaim(10_000);
    now = nowMs + 2_001;
    const expired = await claim(broker.url, simulatorId, handoff.instanceId, generation);
    const expiredWait = await waiting;

    expect(expired.status).toBe(409);
    expect(expired.body).not.toContain(code);
    expect(expiredWait).toBe(false);

    const resetHandoff = createPairingHandoff({ deviceId: simulatorId, now: () => nowMs });
    resetHandoff.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'https://bfm.example.com',
      code,
      expiresAt,
    });
    const resetWait = resetHandoff.waitForClaim(10_000);
    resetHandoff.reset();
    expect(await resetWait).toBe(false);
  });

  it('advances public generations so an old simulator trigger cannot claim a later offer', () => {
    const handoff = createPairingHandoff({ deviceId: simulatorId, now: () => nowMs });
    const firstGeneration = handoff.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'https://bfm.example.com',
      code,
      expiresAt,
    });
    handoff.reset();

    const nextGeneration = handoff.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'https://bfm.example.com',
      code: '8QK4-9M2X-P3ND',
      expiresAt,
    });

    expect(firstGeneration).toBe(1);
    expect(nextGeneration).toBe(2);
    expect(
      handoff.claim({
        deviceId: simulatorId,
        instanceId: handoff.instanceId,
        generation: firstGeneration,
      })
    ).toBeNull();
    expect(
      handoff.claim({
        deviceId: simulatorId,
        instanceId: handoff.instanceId,
        generation: nextGeneration,
      })
    ).toEqual({
      deviceId: simulatorId,
      instanceId: handoff.instanceId,
      generation: nextGeneration,
      pairingBaseUrl: 'https://bfm.example.com',
      code: '8QK4-9M2X-P3ND',
      expiresAt,
    });
  });

  it('rejects an old public trigger against a replacement broker for the same simulator', () => {
    const previous = createPairingHandoff({ deviceId: simulatorId, now: () => nowMs });
    const previousGeneration = previous.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'https://bfm.example.com',
      code,
      expiresAt,
    });
    const replacement = createPairingHandoff({ deviceId: simulatorId, now: () => nowMs });
    const replacementGeneration = replacement.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'https://bfm.example.com',
      code: '8QK4-9M2X-P3ND',
      expiresAt,
    });

    expect(previousGeneration).toBe(replacementGeneration);
    expect(previous.instanceId).not.toBe(replacement.instanceId);
    expect(
      replacement.claim({
        deviceId: simulatorId,
        instanceId: previous.instanceId,
        generation: previousGeneration,
      })
    ).toBeNull();
    expect(
      replacement.claim({
        deviceId: simulatorId,
        instanceId: replacement.instanceId,
        generation: replacementGeneration,
      })?.code
    ).toBe('8QK4-9M2X-P3ND');
  });
});

async function claim(url: string, deviceId: string, instanceId: string, generation: number) {
  const response = await fetch(`${url}/__e2e/pair/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, instanceId, generation }),
  });
  const body = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body,
    json: body.length === 0 ? undefined : JSON.parse(body),
  };
}
