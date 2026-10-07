import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPairingHandoff, startPairingHandoffServer } from '../ios-e2e/pairing-handoff.mjs';
import {
  formatServeOnlyStatus,
  pairSimulatorForServeOnly,
} from '../ios-e2e/serve-only-pairing.mjs';

const simulatorId = '11111111-1111-4111-8111-111111111111';
const code = '7QK4-9M2X-P3ND';
const expiresAt = '2030-01-01T00:00:00.000Z';

describe('serve-only simulator pairing', () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  it('prints only server addresses and stored-session status', () => {
    const status = formatServeOnlyStatus({
      bfmUrl: 'http://127.0.0.1:3014',
      controlUrl: 'http://127.0.0.1:3015',
    });

    expect(status).toContain('server address http://127.0.0.1:3014');
    expect(status).toContain('server address http://127.0.0.1:3015');
    expect(status).toContain('stored a session for this BFM');
    expect(status).not.toContain(code);
  });

  it('waits for a local handoff claim and stored session without returning pairing material', async () => {
    const handoff = createPairingHandoff({ deviceId: simulatorId });
    const generation = handoff.offer({
      deviceId: simulatorId,
      pairingBaseUrl: 'http://127.0.0.1:3014',
      code,
      expiresAt,
    });
    const broker = await startPairingHandoffServer(handoff);
    closeServer = broker.close;
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(`${broker.url}/__e2e/pair`);
      expect(init?.method).toBe('POST');
      const body: unknown = JSON.parse(String(init?.body));
      expect(body).toEqual({
        deviceId: simulatorId,
        pairingBaseUrl: broker.url,
      });
      expect(JSON.stringify(body)).not.toContain(code);
      return new Response('{"paired":true}', { status: 200 });
    };
    let settled = false;
    const pairing = pairSimulatorForServeOnly({
      controlUrl: broker.url,
      deviceId: simulatorId,
      handoff,
      fetchImpl,
      timeoutMs: 5_000,
    }).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    const claim = await fetch(`${broker.url}/__e2e/pair/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: simulatorId,
        instanceId: handoff.instanceId,
        generation,
      }),
    });
    expect(claim.status).toBe(200);
    const claimBody = await claim.text();
    expect(claimBody).toContain(code);
    const completion = await fetch(`${broker.url}/__e2e/pair/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: simulatorId,
        instanceId: handoff.instanceId,
        generation,
        paired: true,
      }),
    });
    expect(completion.status).toBe(204);
    await pairing;
    expect(settled).toBe(true);
  });

  it('rejects a non-loopback origin before making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const handoff = createPairingHandoff({ deviceId: simulatorId });

    await expect(
      pairSimulatorForServeOnly({
        controlUrl: 'https://bfm.example.com',
        deviceId: simulatorId,
        handoff,
        fetchImpl,
      })
    ).rejects.toThrow('ios-e2e serve-only pairing requires the local control plane.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports delivery failure without reflecting the response body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ code }), { status: 503 })
    );
    const handoff = createPairingHandoff({ deviceId: simulatorId });

    await expect(
      pairSimulatorForServeOnly({
        controlUrl: 'http://127.0.0.1:3011',
        deviceId: simulatorId,
        handoff,
        fetchImpl,
      })
    ).rejects.toThrow('ios-e2e serve-only pairing delivery failed.');
  });
});
