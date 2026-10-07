import { describe, expect, it } from 'vitest';

import {
  callMcpTool,
  createMcpInboundAuth,
  formatPairingMcpFailure,
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
    let failure: unknown;
    try {
      parsePairingCodeResponse(
        rpcBody({ ...pairingPayload, token: 'unexpected' }),
        'application/json'
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ stage: 'mcp-metadata' });
    expect(formatPairingMcpFailure(failure)).toContain('mcp-metadata');
    expect(formatPairingMcpFailure(failure)).not.toContain('unexpected');
  });

  it('classifies a tool error without exposing its response text', () => {
    const secret = 'synthetic-private-error-payload';
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { isError: true, content: [{ type: 'text', text: secret }] },
    });
    let failure: unknown;
    try {
      parsePairingCodeResponse(body, 'application/json');
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ stage: 'mcp-tool' });
    expect(formatPairingMcpFailure(failure)).not.toContain(secret);
  });

  it('classifies malformed protocol responses without exposing their body', () => {
    const secret = 'synthetic-private-protocol-body';
    let failure: unknown;
    try {
      parsePairingCodeResponse(secret, 'application/json');
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ stage: 'mcp-response' });
    expect(formatPairingMcpFailure(failure)).not.toContain(secret);
  });
});

describe('createMcpInboundAuth', () => {
  it('uses a run-scoped token and disables an inherited token-file override', () => {
    const auth = createMcpInboundAuth();
    const childEnvironment = {
      MCP_INBOUND_TOKEN_FILE: '/inherited/token-file',
      MCP_INBOUND_TOKEN: 'inherited-token',
      ...auth.environment,
    };

    expect(/^[0-9a-f-]{36}$/u.test(auth.token)).toBe(true);
    expect(childEnvironment['MCP_INBOUND_TOKEN_FILE'] === '').toBe(true);
    expect(childEnvironment['MCP_INBOUND_TOKEN'] === auth.token).toBe(true);
    expect(childEnvironment['MCP_INBOUND_TOKEN'] === 'inherited-token').toBe(false);
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

  it('shares the decoded MCP transport for a read-only tool call', async () => {
    let request: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      request = init;
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '[{"name":"synthetic"}]' }] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const result = await callMcpTool({
      endpoint: 'http://127.0.0.1:3011/mcp',
      name: 'tags.tags.list',
      arguments: {},
      fetchImpl,
    });

    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: 'text', text: '[{"name":"synthetic"}]' }]);
    expect(JSON.parse(String(request?.body))).toMatchObject({
      method: 'tools/call',
      params: { name: 'tags.tags.list', arguments: {} },
    });
  });

  it('reports HTTP status without copying the error response body', async () => {
    const secret = 'synthetic-private-http-body';
    const fetchImpl: typeof fetch = async () => new Response(secret, { status: 403 });

    let failure: unknown;
    try {
      await issuePairingCodeViaMcp({ endpoint: 'http://127.0.0.1:3011/mcp', fetchImpl });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ stage: 'mcp-http', httpStatus: 403 });
    expect(formatPairingMcpFailure(failure)).toContain('(HTTP 403)');
    expect(formatPairingMcpFailure(failure)).not.toContain(secret);
  });

  it('classifies transport failures without copying their messages', async () => {
    const secret = 'synthetic-private-transport-detail';
    const fetchImpl: typeof fetch = async () => {
      throw new Error(secret);
    };

    let failure: unknown;
    try {
      await issuePairingCodeViaMcp({ endpoint: 'http://127.0.0.1:3011/mcp', fetchImpl });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ stage: 'mcp-transport' });
    expect(formatPairingMcpFailure(failure)).not.toContain(secret);
  });
});
