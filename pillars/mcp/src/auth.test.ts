import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

const {
  resolveInboundToken,
  requireInboundToken,
  isInboundAuthConfigured,
  evaluateInboundAuth,
  inboundAuth,
} = await import('./auth.js');

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

  it('rejects a multiline configured file without exposing its path or contents', () => {
    const token = 'sensitive-token-content';
    const path = secretFile(`${token}\nsecond-line`);
    let thrown: unknown;
    try {
      resolveInboundToken({ MCP_INBOUND_TOKEN_FILE: path, MCP_INBOUND_TOKEN: 'fallback-secret' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('MCP_INBOUND_TOKEN_FILE');
    expect((thrown as Error).message).not.toContain(path);
    expect((thrown as Error).message).not.toContain(token);
    expect((thrown as Error).message).not.toContain('fallback-secret');
  });

  it('rejects an environment token containing whitespace', () => {
    expect(() => resolveInboundToken({ MCP_INBOUND_TOKEN: 'two words' })).toThrow(
      /MCP_INBOUND_TOKEN/
    );
  });

  it('reports token availability without revealing a configured value', () => {
    expect(isInboundAuthConfigured({})).toBe(false);
    expect(isInboundAuthConfigured({ MCP_INBOUND_TOKEN: 'configured-secret' })).toBe(true);
    expect(isInboundAuthConfigured({ MCP_INBOUND_TOKEN: '   ' })).toBe(false);
    expect(isInboundAuthConfigured({ MCP_INBOUND_TOKEN_FILE: missingSecretFilePath() })).toBe(
      false
    );
  });

  it('requires a configured non-blank token before startup', () => {
    expect(() => requireInboundToken({})).toThrow(/MCP_INBOUND_TOKEN_FILE.*MCP_INBOUND_TOKEN/);
    expect(() => requireInboundToken({ MCP_INBOUND_TOKEN: '   ' })).toThrow(
      /MCP_INBOUND_TOKEN_FILE.*MCP_INBOUND_TOKEN/
    );
    expect(() => requireInboundToken({ MCP_INBOUND_TOKEN: 'valid-token' })).not.toThrow();
  });
});

describe('evaluateInboundAuth — unconfigured mode', () => {
  beforeEach(() => {
    delete process.env['MCP_INBOUND_TOKEN'];
    delete process.env['MCP_INBOUND_TOKEN_FILE'];
  });

  afterEach(restoreAuthConfiguration);

  it('denies requests if the inbound token is unset or blank', () => {
    expect(evaluateInboundAuth(undefined)).toEqual({
      authorized: false,
      mode: 'unconfigured',
      reason: 'Inbound authentication is not configured',
    });
    process.env['MCP_INBOUND_TOKEN'] = '   ';
    expect(evaluateInboundAuth('Bearer anything')).toMatchObject({
      authorized: false,
      mode: 'unconfigured',
    });
  });

  it('denies requests for malformed server configuration without exposing it', () => {
    const tokenPath = secretFile('must-not-appear\nsecond-line');
    process.env['MCP_INBOUND_TOKEN_FILE'] = tokenPath;
    const decision = evaluateInboundAuth('Bearer must-not-appear');
    expect(decision).toMatchObject({ authorized: false, mode: 'unconfigured' });
    expect(JSON.stringify(decision)).not.toContain(tokenPath);
    expect(JSON.stringify(decision)).not.toContain('must-not-appear');
  });
});

describe('evaluateInboundAuth — enforced mode (token configured)', () => {
  const token = 'correct-horse-battery-staple';

  beforeEach(() => {
    delete process.env['MCP_INBOUND_TOKEN_FILE'];
    process.env['MCP_INBOUND_TOKEN'] = token;
  });

  afterEach(restoreAuthConfiguration);

  it('rejects a request with no Authorization header', () => {
    expect(evaluateInboundAuth(undefined)).toEqual({
      authorized: false,
      mode: 'rejected',
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
      mode: 'rejected',
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

  it('returns 503 and does not reach the handler when no token is configured', async () => {
    delete process.env['MCP_INBOUND_TOKEN'];
    const res = await fetch(`${baseUrl}/mcp`, { method: 'POST' });
    expect(res.status).toBe(503);
    expect(res.headers.get('www-authenticate')).toBeNull();
    const body = (await res.json()) as ErrorBody;
    expect(body).toEqual({
      code: 'mcp.auth.unavailable',
      message: 'Inbound authentication is not configured.',
      requestId: expect.any(String),
      retryable: true,
    });
  });

  it('does not disclose malformed file details in an HTTP error', async () => {
    const fileToken = 'private-file-token-content';
    process.env['MCP_INBOUND_TOKEN_FILE'] = secretFile(`${fileToken}\nsecond-line`);
    process.env['MCP_INBOUND_TOKEN'] = 'fallback-secret';
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${fileToken}` },
    });
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain(fileToken);
    expect(body).not.toContain('fallback-secret');
    expect(body).not.toContain(process.env['MCP_INBOUND_TOKEN_FILE']);
  });
});
