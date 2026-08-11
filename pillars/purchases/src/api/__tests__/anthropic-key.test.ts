import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveAnthropicApiKey } from '../anthropic-key.js';

const FILE_VAR = 'ANTHROPIC_API_KEY_FILE';
const ENV_VAR = 'ANTHROPIC_API_KEY';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'purchases-anthropic-key-'));
  delete process.env[FILE_VAR];
  delete process.env[ENV_VAR];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env[FILE_VAR];
  delete process.env[ENV_VAR];
});

function keyFile(contents: string): string {
  const path = join(dir, 'key');
  writeFileSync(path, contents, 'utf-8');
  return path;
}

describe('resolveAnthropicApiKey', () => {
  it('prefers the secret file over the env var when the file holds a key', () => {
    process.env[FILE_VAR] = keyFile('sk-from-file\n');
    process.env[ENV_VAR] = 'sk-from-env';
    expect(resolveAnthropicApiKey()).toBe('sk-from-file');
  });

  it('falls back to the env var when ANTHROPIC_API_KEY_FILE is unset', () => {
    process.env[ENV_VAR] = 'sk-from-env';
    expect(resolveAnthropicApiKey()).toBe('sk-from-env');
  });

  it('falls back to the env var when ANTHROPIC_API_KEY_FILE is the empty string', () => {
    process.env[FILE_VAR] = '';
    process.env[ENV_VAR] = 'sk-from-env';
    expect(resolveAnthropicApiKey()).toBe('sk-from-env');
  });

  it('falls back to the env var when the file does not exist', () => {
    process.env[FILE_VAR] = join(dir, 'does-not-exist');
    process.env[ENV_VAR] = 'sk-from-env';
    expect(resolveAnthropicApiKey()).toBe('sk-from-env');
  });

  it('falls back to the env var when the file is empty', () => {
    process.env[FILE_VAR] = keyFile('   \n');
    process.env[ENV_VAR] = 'sk-from-env';
    expect(resolveAnthropicApiKey()).toBe('sk-from-env');
  });

  it('returns undefined when neither source yields a key', () => {
    expect(resolveAnthropicApiKey()).toBeUndefined();
  });

  it('returns undefined when ANTHROPIC_API_KEY is set but blank', () => {
    process.env[ENV_VAR] = '   ';
    expect(resolveAnthropicApiKey()).toBeUndefined();
  });

  it('trims whitespace from the env var', () => {
    process.env[ENV_VAR] = '  sk-padded  ';
    expect(resolveAnthropicApiKey()).toBe('sk-padded');
  });

  it('returns undefined when the file is empty and the env var is unset', () => {
    process.env[FILE_VAR] = keyFile('');
    expect(resolveAnthropicApiKey()).toBeUndefined();
  });
});
