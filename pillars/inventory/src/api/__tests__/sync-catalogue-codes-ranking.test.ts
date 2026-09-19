/**
 * `POST /codes/suggest` ranked through a stub `ai` pillar client
 * (POPS-4081). The deterministic order (`sync-catalogue-codes.test.ts`) is
 * the fallback every one of these paths must land on when ranking cannot be
 * trusted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openSyncHarness, PROTOCOL, type SyncHarness } from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { AiClient } from '../ai/client.js';

const transport = createTestTransport();
let h: SyncHarness;

function withAi(ai: AiClient): void {
  h = openSyncHarness(transport, { ai });
}

afterEach(() => h.close());

async function suggest(body: Record<string, string>): Promise<string[]> {
  const response = await h.api.post('/codes/suggest').set(PROTOCOL).send(body);
  expect(response.status).toBe(200);
  return response.body.suggestions as string[];
}

describe('POST /codes/suggest — ranked through ai', () => {
  it('uses the ranked order the ai client returns', async () => {
    withAi({
      rankCodeCandidates: async (candidates) => [...candidates].reverse(),
    });

    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q003', 'Q002', 'Q001']);
  });

  it('falls back to the deterministic order when the ai client reports failure', async () => {
    withAi({ rankCodeCandidates: async () => undefined });

    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q001', 'Q002', 'Q003']);
  });

  it('falls back to the deterministic order when the ai client throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    withAi({ rankCodeCandidates: () => Promise.reject(new Error('boom')) });

    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q001', 'Q002', 'Q003']);
    error.mockRestore();
  });

  it('never lets a ranked response introduce a code the caller did not offer', async () => {
    withAi({
      // A misbehaving or adversarial ai pillar substituting a held code the
      // deterministic candidates never included; the handler must not
      // forward this — the whole point of validating a permutation.
      rankCodeCandidates: async () => ['Q001', 'HELD'],
    });

    expect(await suggest({ name: 'Anything', stem: 'Q' })).toEqual(['Q001', 'Q002', 'Q003']);
  });
});
