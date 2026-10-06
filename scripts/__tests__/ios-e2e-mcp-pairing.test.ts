import { describe, expect, it } from 'vitest';

import {
  createMcpInboundAuth,
  issuePairingCodeViaMcp,
  parsePairingCodeResponse,
} from '../ios-e2e/mcp-pairing-code.mjs';

const pairingPayload = {
  code: 'fixture-code',
  pairingUrl: 'https://bfm.example.test/devices/pair?code=fixture-code',
  expiresAt: '2026-09-29T00:00:00.000Z',
};

function rpcBody(payload: Record<string, unknown>) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
  });
}

describe('parsePairingCodeResponse', () => {
  it('accepts a direct JSON response', () => {
    expect(parsePairingCodeResponse(rpcBody(pairingPayload), 'application/json')).toEqual(
      pairingPayload
    );
  });

  it('accepts an SSE response', () => {
    const body = `event: message\ndata: ${rpcBody(pairingPayload)}\n\n`;

    expect(parsePairingCodeResponse(body, 'text/event-stream')).toEqual(pairingPayload);
  });

  it('rejects extra fields so the bridge cannot pass through credentials', () => {
    expect(() =>
      parsePairingCodeResponse(
        rpcBody({ ...pairingPayload, token: 'unexpected' }),
        'application/json'
      )
    ).toThrow(/invalid pairing metadata/iu);
  });
});

describe('createMcpInboundAuth', () => {
  it('uses a run-scoped token and disables any inherited token-file override', () => {
    const auth = createMcpInboundAuth();
    const childEnvironment = {
      MCP_INBOUND_TOKEN_FILE: '/inherited/token-file',
      MCP_INBOUND_TOKEN: 'inherited-token',
      ...auth.environment,
    };

    expect(auth.token).toMatch(/^[0-9a-f-]{36}$/u);
    expect(childEnvironment).toEqual({
      MCP_INBOUND_TOKEN_FILE: '',
      MCP_INBOUND_TOKEN: auth.token,
    });
  });
});

describe('issuePairingCodeViaMcp', () => {
  it('sends the pairing tool call and parses the response', async () => {
    let request: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      request = init;
      return new Response(rpcBody(pairingPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await expect(
      issuePairingCodeViaMcp({ endpoint: 'http://127.0.0.1:3011/mcp', fetchImpl })
    ).resolves.toEqual(pairingPayload);

    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-06-18',
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      method: 'tools/call',
      params: { name: 'bfm.devicePairing.issueCode', arguments: {} },
    });
  });

  it('does not copy an error response body into diagnostics', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('contains a credential that must not be printed', { status: 403 });

    await expect(
      issuePairingCodeViaMcp({ endpoint: 'http://127.0.0.1:3011/mcp', fetchImpl })
    ).rejects.toThrow('MCP pairing tool HTTP 403');
  });
});
