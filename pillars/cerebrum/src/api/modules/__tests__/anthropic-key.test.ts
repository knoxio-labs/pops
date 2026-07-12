/**
 * Unit tests for {@link resolveAnthropicApiKey}: the file-first / env-fallback
 * resolution and every degradation path (missing file, empty file, empty env).
 * Real filesystem, real env — no mocks — so a regression in precedence or
 * trimming surfaces here rather than silently in prod.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveAnthropicApiKey } from '../anthropic-key.js';

const FILE_ENV = 'ANTHROPIC_API_KEY_FILE';
const KEY_ENV = 'ANTHROPIC_API_KEY';

let tmp: string;
let priorFile: string | undefined;
let priorKey: string | undefined;

function writeSecretFile(name: string, contents: string): string {
  const path = join(tmp, name);
  writeFileSync(path, contents, 'utf-8');
  return path;
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cerebrum-key-'));
  priorFile = process.env[FILE_ENV];
  priorKey = process.env[KEY_ENV];
  delete process.env[FILE_ENV];
  delete process.env[KEY_ENV];
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  restore(FILE_ENV, priorFile);
  restore(KEY_ENV, priorKey);
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('resolveAnthropicApiKey', () => {
  it('returns the env var when no file is configured', () => {
    process.env[KEY_ENV] = 'sk-env';
    expect(resolveAnthropicApiKey()).toBe('sk-env');
  });

  it('reads the secret file when configured, trimming trailing newline', () => {
    process.env[FILE_ENV] = writeSecretFile('key', 'sk-file\n');
    expect(resolveAnthropicApiKey()).toBe('sk-file');
  });

  it('prefers the file over the env var when both are set', () => {
    process.env[FILE_ENV] = writeSecretFile('key', 'sk-file');
    process.env[KEY_ENV] = 'sk-env';
    expect(resolveAnthropicApiKey()).toBe('sk-file');
  });

  it('falls back to the env var when the file path does not exist', () => {
    process.env[FILE_ENV] = join(tmp, 'missing');
    process.env[KEY_ENV] = 'sk-env';
    expect(resolveAnthropicApiKey()).toBe('sk-env');
  });

  it('falls back to the env var when the file is empty / whitespace', () => {
    process.env[FILE_ENV] = writeSecretFile('key', '   \n');
    process.env[KEY_ENV] = 'sk-env';
    expect(resolveAnthropicApiKey()).toBe('sk-env');
  });

  it('returns undefined when the file is missing and no env var is set', () => {
    process.env[FILE_ENV] = join(tmp, 'missing');
    expect(resolveAnthropicApiKey()).toBeUndefined();
  });

  it('returns undefined when the env var is an empty string', () => {
    process.env[KEY_ENV] = '';
    expect(resolveAnthropicApiKey()).toBeUndefined();
  });

  it('returns undefined when neither source is set', () => {
    expect(resolveAnthropicApiKey()).toBeUndefined();
  });
});
