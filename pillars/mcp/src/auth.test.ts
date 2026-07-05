import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalToken = process.env['MCP_INBOUND_TOKEN'];

function restoreToken(): void {
  if (originalToken === undefined) delete process.env['MCP_INBOUND_TOKEN'];
  else process.env['MCP_INBOUND_TOKEN'] = originalToken;
}

const { resolveInboundToken, evaluateInboundAuth, inboundAuth, __resetInboundAuthWarningForTests } =
  await import('./auth.js');

describe('resolveInboundToken', () => {
  afterEach(restoreToken);

  it('returns undefined when MCP_INBOUND_TOKEN is unset', () => {
    delete process.env['MCP_INBOUND_TOKEN'];
    expect(resolveInboundToken()).toBeUndefined();
  });

  it('treats an empty or whitespace-only value as unset', () => {
    process.env['MCP_INBOUND_TOKEN'] = '   ';
    expect(resolveInboundToken()).toBeUndefined();
    process.env['MCP_INBOUND_TOKEN'] = '';
    expect(resolveInboundToken()).toBeUndefined();
  });

  it('trims surrounding whitespace from a configured token', () => {
    process.env['MCP_INBOUND_TOKEN'] = '  sekret-token  ';
    expect(resolveInboundToken()).toBe('sekret-token');
  });
});

describe('evaluateInboundAuth — open mode (no token configured)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env['MCP_INBOUND_TOKEN'];
    __resetInboundAuthWarningForTests();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    restoreToken();
  });

  it('authorizes any caller and reports open mode', () => {
    expect(evaluateInboundAuth(undefined)).toEqual({ authorized: true, mode: 'open' });
    expect(evaluateInboundAuth('Bearer anything')).toEqual({ authorized: true, mode: 'open' });
  });

  it('emits the loud unprotected warning exactly once across many requests', () => {
    evaluateInboundAuth(undefined);
    evaluateInboundAuth(undefined);
    evaluateInboundAuth('Bearer x');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('MCP_INBOUND_TOKEN is not set');
  });
});

describe('evaluateInboundAuth — enforced mode (token configured)', () => {
  const token = 'correct-horse-battery-staple';

  beforeEach(() => {
    process.env['MCP_INBOUND_TOKEN'] = token;
    __resetInboundAuthWarningForTests();
  });

  afterEach(restoreToken);

  it('rejects a request with no Authorization header', () => {
    expect(evaluateInboundAuth(undefined)).toEqual({
      authorized: false,
      reason: 'Missing bearer token',
    });
  });

  it('rejects a non-bearer scheme', () => {
    expect(evaluateInboundAuth(`Basic ${token}`).authorized).toBe(false);
  });

  it('rejects an empty bearer value', () => {
    expect(evaluateInboundAuth('Bearer ').authorized).toBe(false);
  });

  it('rejects a wrong token of equal length', () => {
    const wrong = 'x'.repeat(token.length);
    expect(evaluateInboundAuth(`Bearer ${wrong}`)).toEqual({
      authorized: false,
      reason: 'Invalid bearer token',
    });
  });

  it('rejects a token that is a prefix of the expected token', () => {
    expect(evaluateInboundAuth(`Bearer ${token.slice(0, -1)}`).authorized).toBe(false);
  });

  it('accepts the exact token and reports enforced mode', () => {
    expect(evaluateInboundAuth(`Bearer ${token}`)).toEqual({
      authorized: true,
      mode: 'enforced',
    });
  });

  it('accepts a case-insensitive scheme and tolerates extra internal whitespace', () => {
    expect(evaluateInboundAuth(`bearer   ${token}`)).toEqual({
      authorized: true,
      mode: 'enforced',
    });
  });

  it('never warns while a token is configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    evaluateInboundAuth(`Bearer ${token}`);
    evaluateInboundAuth(undefined);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('inboundAuth middleware over HTTP', () => {
  const token = 'http-integration-token';
  let server: HttpServer;
  let baseUrl = '';

  const app = express();
  app.post('/mcp', inboundAuth, (_req, res) => {
    res.status(200).json({ reached: true });
  });

  beforeEach(async () => {
    __resetInboundAuthWarningForTests();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    restoreToken();
  });

  it('returns 401 with WWW-Authenticate and does not reach the handler when the token is missing', async () => {
    process.env['MCP_INBOUND_TOKEN'] = token;
    const res = await fetch(`${baseUrl}/mcp`, { method: 'POST' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
    const body = (await res.json()) as { error: string; reached?: boolean };
    expect(body.error).toBe('unauthorized');
    expect(body.reached).toBeUndefined();
  });

  it('returns 401 for a wrong token', async () => {
    process.env['MCP_INBOUND_TOKEN'] = token;
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer nope' },
    });
    expect(res.status).toBe(401);
  });

  it('passes to the handler with a valid token', async () => {
    process.env['MCP_INBOUND_TOKEN'] = token;
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reached: boolean };
    expect(body.reached).toBe(true);
  });

  it('passes to the handler unauthenticated when no token is configured', async () => {
    delete process.env['MCP_INBOUND_TOKEN'];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await fetch(`${baseUrl}/mcp`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
