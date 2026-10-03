import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ErrorBody } from '@pops/types';

const originalToken = process.env['MCP_INBOUND_TOKEN'];
const originalTokenFile = process.env['MCP_INBOUND_TOKEN_FILE'];
const temporaryDirectories = new Set<string>();

function restoreAuthConfiguration(): void {
  if (originalToken === undefined) delete process.env['MCP_INBOUND_TOKEN'];
  else process.env['MCP_INBOUND_TOKEN'] = originalToken;

  if (originalTokenFile === undefined) delete process.env['MCP_INBOUND_TOKEN_FILE'];
  else process.env['MCP_INBOUND_TOKEN_FILE'] = originalTokenFile;

  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
}

function secretFile(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'pops-mcp-inbound-auth-'));
  temporaryDirectories.add(directory);
  const path = join(directory, 'inbound-token');
  writeFileSync(path, contents);
  return path;
}

function missingSecretFilePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pops-mcp-inbound-auth-missing-'));
  temporaryDirectories.add(directory);
  return join(directory, 'missing-token');
}

const { resolveInboundToken, evaluateInboundAuth, inboundAuth, __resetInboundAuthWarningForTests } =
  await import('./auth.js');

describe('resolveInboundToken', () => {
  beforeEach(() => {
    delete process.env['MCP_INBOUND_TOKEN'];
    delete process.env['MCP_INBOUND_TOKEN_FILE'];
  });

  afterEach(restoreAuthConfiguration);

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

  it('reads the token from the configured file', () => {
    const path = secretFile('file-token');
    expect(resolveInboundToken({ MCP_INBOUND_TOKEN_FILE: path })).toBe('file-token');
  });

  it('prefers the file over MCP_INBOUND_TOKEN', () => {
    const path = secretFile('from-file');
    expect(
      resolveInboundToken({ MCP_INBOUND_TOKEN_FILE: path, MCP_INBOUND_TOKEN: 'from-env' })
    ).toBe('from-file');
  });

  it('trims the trailing newline from a file token', () => {
    const path = secretFile('file-token\r\n');
    expect(resolveInboundToken({ MCP_INBOUND_TOKEN_FILE: path })).toBe('file-token');
  });

  it('throws for a missing configured file instead of falling back to the env token', () => {
    const path = missingSecretFilePath();
    expect(() =>
      resolveInboundToken({ MCP_INBOUND_TOKEN_FILE: path, MCP_INBOUND_TOKEN: 'from-env' })
    ).toThrow(/MCP_INBOUND_TOKEN_FILE/);
  });

  it('throws for an empty configured file instead of falling back to the env token', () => {
    const path = secretFile(' \n');
    expect(() =>
      resolveInboundToken({ MCP_INBOUND_TOKEN_FILE: path, MCP_INBOUND_TOKEN: 'from-env' })
    ).toThrow(/MCP_INBOUND_TOKEN_FILE/);
  });
});

describe('evaluateInboundAuth — open mode (no token configured)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env['MCP_INBOUND_TOKEN'];
    delete process.env['MCP_INBOUND_TOKEN_FILE'];
    __resetInboundAuthWarningForTests();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    restoreAuthConfiguration();
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
    delete process.env['MCP_INBOUND_TOKEN_FILE'];
    process.env['MCP_INBOUND_TOKEN'] = token;
    __resetInboundAuthWarningForTests();
  });

  afterEach(restoreAuthConfiguration);

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
    delete process.env['MCP_INBOUND_TOKEN_FILE'];
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    restoreAuthConfiguration();
  });

  it('returns 401 with WWW-Authenticate and does not reach the handler when the token is missing', async () => {
    process.env['MCP_INBOUND_TOKEN'] = token;
    const res = await fetch(`${baseUrl}/mcp`, { method: 'POST' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('Bearer');
    const body = (await res.json()) as ErrorBody;
    expect(body).toEqual({
      code: 'mcp.auth.unauthorized',
      message: 'A valid bearer token is required.',
      requestId: expect.any(String),
      retryable: false,
    });
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

  it('enforces a token read from the configured file', async () => {
    const fileToken = 'file-backed-token';
    process.env['MCP_INBOUND_TOKEN_FILE'] = secretFile(fileToken + '\n');
    process.env['MCP_INBOUND_TOKEN'] = 'ignored-env-token';

    const accepted = await fetch(baseUrl + '/mcp', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + fileToken },
    });
    const rejected = await fetch(baseUrl + '/mcp', {
      method: 'POST',
      headers: { Authorization: 'Bearer ignored-env-token' },
    });

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(401);
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
