import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractText, mockPillarBfm, parseResult, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { bfmTools } = await import('./bfm.js');

const issuePairingCode = mockPillarBfm.bfm.operator.issuePairingCode;
const tool = bfmTools.find((candidate) => candidate.name === 'bfm.devicePairing.issueCode');
if (tool === undefined) throw new Error('BFM pairing tool is not registered');

beforeEach(() => {
  vi.clearAllMocks();
  issuePairingCode.mockResolvedValue({
    kind: 'ok',
    value: {
      code: 'fixture-code',
      pairingUrl: 'https://bfm.example.test/devices/pair?code=fixture-code',
      expiresAt: '2026-09-29T00:00:00.000Z',
    },
  });
});

describe('bfm.devicePairing.issueCode', () => {
  it('calls the BFM route with an empty body and returns only pairing metadata', async () => {
    const result = await tool.handler({});

    expect(issuePairingCode).toHaveBeenCalledWith({});
    expect(parseResult(result)).toEqual({
      code: 'fixture-code',
      pairingUrl: 'https://bfm.example.test/devices/pair?code=fixture-code',
      expiresAt: '2026-09-29T00:00:00.000Z',
    });
    expect(extractText(result)).not.toMatch(/token|credential|private|secret/iu);
  });

  it('declares the exact producer scope used by BFM', () => {
    expect(tool.scope).toBe('bfm.operator.issuePairingCode');
  });

  it('turns a producer refusal into an actionable MCP error', async () => {
    issuePairingCode.mockResolvedValueOnce({
      kind: 'unauthorized',
      pillar: 'bfm',
      message: 'This service account is not authorised for this operation.',
    });

    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('bfm.operator.issuePairingCode');
  });
});
