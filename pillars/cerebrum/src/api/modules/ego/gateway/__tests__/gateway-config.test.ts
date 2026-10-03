import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readGatewayConfig } from '../gateway-config.js';

describe('readGatewayConfig', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ego-gateway-config-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns null without a url', () => {
    expect(readGatewayConfig({ CEREBRUM_EGO_MCP_TOKEN: 'tok' })).toBeNull();
  });

  it('returns null without a token', () => {
    expect(readGatewayConfig({ CEREBRUM_EGO_MCP_URL: 'http://gw/mcp' })).toBeNull();
  });

  it('trims the token read from the file', () => {
    const file = join(dir, 'token');
    writeFileSync(file, '  file-token\n');
    expect(
      readGatewayConfig({
        CEREBRUM_EGO_MCP_URL: 'http://gw/mcp',
        CEREBRUM_EGO_MCP_TOKEN_FILE: file,
      })
    ).toEqual({ url: 'http://gw/mcp', token: 'file-token' });
  });

  it('prefers the file over the plain variable', () => {
    const file = join(dir, 'token');
    writeFileSync(file, 'file-token');
    expect(
      readGatewayConfig({
        CEREBRUM_EGO_MCP_URL: 'http://gw/mcp',
        CEREBRUM_EGO_MCP_TOKEN_FILE: file,
        CEREBRUM_EGO_MCP_TOKEN: 'env-token',
      })?.token
    ).toBe('file-token');
  });

  it('falls back to the plain variable and warns with the path when the file is unreadable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const file = join(dir, 'missing');
    const config = readGatewayConfig({
      CEREBRUM_EGO_MCP_URL: 'http://gw/mcp',
      CEREBRUM_EGO_MCP_TOKEN_FILE: file,
      CEREBRUM_EGO_MCP_TOKEN: 'env-token',
    });
    expect(config?.token).toBe('env-token');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain(file);
    expect(message).not.toContain('env-token');
  });

  it('falls back to the plain variable when the file is empty', () => {
    const file = join(dir, 'token');
    writeFileSync(file, '  \n');
    expect(
      readGatewayConfig({
        CEREBRUM_EGO_MCP_URL: 'http://gw/mcp',
        CEREBRUM_EGO_MCP_TOKEN_FILE: file,
        CEREBRUM_EGO_MCP_TOKEN: 'env-token',
      })?.token
    ).toBe('env-token');
  });

  it('treats empty strings as unset', () => {
    expect(
      readGatewayConfig({ CEREBRUM_EGO_MCP_URL: '', CEREBRUM_EGO_MCP_TOKEN: 'tok' })
    ).toBeNull();
    expect(
      readGatewayConfig({ CEREBRUM_EGO_MCP_URL: 'http://gw/mcp', CEREBRUM_EGO_MCP_TOKEN: '' })
    ).toBeNull();
  });
});
