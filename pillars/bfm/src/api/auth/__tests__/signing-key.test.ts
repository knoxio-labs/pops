/**
 * The signing key is the whole perimeter: anyone who holds it mints a token
 * for any device id. These assertions are therefore about what the resolver
 * *refuses*, not about what it accepts.
 */
import { writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_SECRET_FILE_VAR,
  ACCESS_TOKEN_SECRET_VAR,
  AccessTokenSecretError,
  MIN_ACCESS_TOKEN_SECRET_LENGTH,
  resolveAccessTokenSigningKey,
} from '../signing-key.js';

const LONG_ENOUGH = 'k'.repeat(MIN_ACCESS_TOKEN_SECRET_LENGTH);

const tempDirs: string[] = [];

function writeSecretFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bfm-secret-'));
  tempDirs.push(dir);
  const path = join(dir, 'bfm_access_token_secret');
  writeFileSync(path, contents, 'utf8');
  return path;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('resolveAccessTokenSigningKey', () => {
  it('reads the mounted secret file', () => {
    const path = writeSecretFile(LONG_ENOUGH);

    const key = resolveAccessTokenSigningKey({ [ACCESS_TOKEN_SECRET_FILE_VAR]: path });

    expect(key.type).toBe('secret');
    expect(key.export().toString('utf8')).toBe(LONG_ENOUGH);
  });

  it('strips the trailing newline a file secret is written with', () => {
    const path = writeSecretFile(`${LONG_ENOUGH}\n`);

    const key = resolveAccessTokenSigningKey({ [ACCESS_TOKEN_SECRET_FILE_VAR]: path });

    expect(key.export().toString('utf8')).toBe(LONG_ENOUGH);
  });

  it('prefers the file over the inline variable when both are set', () => {
    const path = writeSecretFile(`file-${LONG_ENOUGH}`);

    const key = resolveAccessTokenSigningKey({
      [ACCESS_TOKEN_SECRET_FILE_VAR]: path,
      [ACCESS_TOKEN_SECRET_VAR]: `inline-${LONG_ENOUGH}`,
    });

    expect(key.export().toString('utf8')).toBe(`file-${LONG_ENOUGH}`);
  });

  it('falls back to the inline variable for local dev', () => {
    const key = resolveAccessTokenSigningKey({ [ACCESS_TOKEN_SECRET_VAR]: LONG_ENOUGH });

    expect(key.export().toString('utf8')).toBe(LONG_ENOUGH);
  });

  it('crashes rather than silently using the dev value when the mount is unreadable', () => {
    // The failure this guards is a production process quietly signing with
    // whatever a leftover dev export happened to be.
    expect(() =>
      resolveAccessTokenSigningKey({
        [ACCESS_TOKEN_SECRET_FILE_VAR]: join(tmpdir(), 'bfm-no-such-secret-file'),
        [ACCESS_TOKEN_SECRET_VAR]: LONG_ENOUGH,
      })
    ).toThrow(AccessTokenSecretError);
  });

  it('crashes when neither source is configured', () => {
    expect(() => resolveAccessTokenSigningKey({})).toThrow(AccessTokenSecretError);
  });

  it.each([
    ['a blank inline value', { [ACCESS_TOKEN_SECRET_VAR]: '   ' }],
    ['an empty inline value', { [ACCESS_TOKEN_SECRET_VAR]: '' }],
  ])('treats %s as unconfigured', (_label, env) => {
    expect(() => resolveAccessTokenSigningKey(env)).toThrow(/no access-token signing key/);
  });

  it('treats a blank file path as unset and falls through to the inline value', () => {
    const key = resolveAccessTokenSigningKey({
      [ACCESS_TOKEN_SECRET_FILE_VAR]: '  ',
      [ACCESS_TOKEN_SECRET_VAR]: LONG_ENOUGH,
    });

    expect(key.export().toString('utf8')).toBe(LONG_ENOUGH);
  });

  it('rejects a key one character short of the floor', () => {
    expect(() =>
      resolveAccessTokenSigningKey({
        [ACCESS_TOKEN_SECRET_VAR]: 'k'.repeat(MIN_ACCESS_TOKEN_SECRET_LENGTH - 1),
      })
    ).toThrow(AccessTokenSecretError);
  });

  it('rejects an empty secret file, which reads as a mount that produced nothing', () => {
    const path = writeSecretFile('\n');

    expect(() => resolveAccessTokenSigningKey({ [ACCESS_TOKEN_SECRET_FILE_VAR]: path })).toThrow(
      AccessTokenSecretError
    );
  });

  it('names the variable at fault and never the value', () => {
    const secret = `sup3r-secret-${'x'.repeat(40)}`;

    // Too short to pass, long enough that a substring leak would be obvious.
    const short = secret.slice(0, MIN_ACCESS_TOKEN_SECRET_LENGTH - 1);
    let message = '';
    try {
      resolveAccessTokenSigningKey({ [ACCESS_TOKEN_SECRET_VAR]: short });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(ACCESS_TOKEN_SECRET_VAR);
    expect(message).not.toContain(short);
  });
});
