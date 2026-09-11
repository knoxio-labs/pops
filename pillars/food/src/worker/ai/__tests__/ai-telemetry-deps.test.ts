/**
 * The wiring gap POPS-2332 fixed: `foodTelemetryDeps()` used to leave
 * `report` unset, so `callWithLogging` fell back to the bare env-driven sink
 * with no `onError`, and a record the ai pillar refused (revoked or stale
 * credential) vanished with nothing logged anywhere.
 *
 * This drives the real (non-overridden) deps against a stand-in ai pillar
 * that refuses every record, and asserts the refusal is audible. Module state
 * is cached per process (`cached ??=`), so each test resets modules and
 * re-imports to get a fresh deps instance built against that test's env.
 */
import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceRecord } from '@pops/ai-telemetry';

const RECORD: InferenceRecord = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  operation: 'test-operation',
  domain: 'food',
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  latencyMs: 12,
  status: 'success',
  cached: false,
};

let server: Server;

function refusingAiPillarStandIn(): Server {
  return createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/ai-usage/record') {
      req.on('data', () => undefined);
      req.on('end', () => {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden' }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
}

async function listenOnLoopback(): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the ai pillar stand-in did not bind a TCP port');
  }
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  vi.resetModules();
  server = refusingAiPillarStandIn();
  process.env['AI_API_URL'] = await listenOnLoopback();
  process.env['POPS_INTERNAL_CREDENTIAL'] = 'food-worker.a-test-secret';
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete process.env['AI_API_URL'];
  delete process.env['POPS_INTERNAL_CREDENTIAL'];
  vi.restoreAllMocks();
});

describe('foodTelemetryDeps — a record the ai pillar refuses', () => {
  it('is logged naming the credential env vars, and never silently dropped', async () => {
    const { foodTelemetryDeps } = await import('../ai-telemetry-deps.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await foodTelemetryDeps().report?.(RECORD);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());

    const line = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(line).toContain('403');
    expect(line).toContain('POPS_INTERNAL_CREDENTIAL_FILE');
    expect(line).toContain('POPS_INTERNAL_SECRET_FOOD_WORKER');
    expect(line).not.toContain('a-test-secret');
  });
});
