import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  InvalidSecretNameError,
  MissingSecretError,
  readNamedSecret,
  requireNamedSecret,
} from '../secrets.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'finance-secrets-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readNamedSecret', () => {
  it('prefers the _FILE source and trims the trailing newline a mounted secret carries', () => {
    const file = join(dir, 'up');
    writeFileSync(file, 'file-token\n');
    expect(readNamedSecret('UP_TOKEN', { UP_TOKEN_FILE: file, UP_TOKEN: 'env-token' })).toBe(
      'file-token'
    );
  });

  it('falls back to the plain variable', () => {
    expect(readNamedSecret('UP_TOKEN', { UP_TOKEN: ' env-token ' })).toBe('env-token');
  });

  it('is undefined for an unset or blank value rather than an empty string', () => {
    expect(readNamedSecret('UP_TOKEN', {})).toBeUndefined();
    expect(readNamedSecret('UP_TOKEN', { UP_TOKEN: '   ' })).toBeUndefined();
    const blank = join(dir, 'blank');
    writeFileSync(blank, '\n');
    expect(readNamedSecret('UP_TOKEN', { UP_TOKEN_FILE: blank })).toBeUndefined();
  });

  it('refuses a name that is not an environment-variable name', () => {
    expect(() => readNamedSecret('up token', {})).toThrow(InvalidSecretNameError);
    expect(() => readNamedSecret('../etc/passwd', {})).toThrow(InvalidSecretNameError);
    expect(() => readNamedSecret('', {})).toThrow(InvalidSecretNameError);
  });

  it('reads nothing from the real environment when one is supplied', () => {
    expect(readNamedSecret('PATH', {})).toBeUndefined();
  });
});

describe('requireNamedSecret', () => {
  it('names the two sources in the error for a missing secret', () => {
    expect(() => requireNamedSecret('UP_TOKEN', {})).toThrow(MissingSecretError);
    expect(() => requireNamedSecret('UP_TOKEN', {})).toThrow('UP_TOKEN_FILE');
    expect(requireNamedSecret('UP_TOKEN', { UP_TOKEN: 'x' })).toBe('x');
  });
});
