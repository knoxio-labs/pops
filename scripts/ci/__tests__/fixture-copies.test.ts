import { describe, expect, it, vi } from 'vitest';

import {
  checkCopies,
  isFileNotFound,
  repoCopyReader,
  resolveCanonical,
  selfTestCopyHandling,
} from '../fixture-copies.mjs';

const COPIES = Object.freeze([
  Object.freeze({ role: 'canonical', path: 'producer/thing-v1.json' }),
  Object.freeze({ role: 'vendored', path: 'consumer/thing-v1.json' }),
]);

const CANONICAL = 'producer/thing-v1.json';
const VENDORED = 'consumer/thing-v1.json';

const valid = { version: 1, value: 'held' };

/** Whatever the caller pinned; the copy machinery never inspects the shape. */
const validate = (fixture: typeof valid) =>
  fixture.value === 'held' ? [] : [`value: ${String(fixture.value)}`];

const readerOver = (files: Map<string, string>) => (path: string) => files.get(path) ?? null;

function allIdentical() {
  const text = JSON.stringify(valid);
  return new Map(COPIES.map(({ path }) => [path, text]));
}

describe('resolveCanonical', () => {
  it('finds the one copy under the given root', () => {
    expect(resolveCanonical(COPIES, 'producer/')).toBe(COPIES[0]);
  });

  it('refuses a root that matches nothing, rather than returning undefined', () => {
    // The committed copy lists always satisfy this, so nothing else exercises
    // it. Returning undefined here would make every later comparison compare
    // against `undefined.path` and throw somewhere far less legible.
    expect(() => resolveCanonical(COPIES, 'nowhere/')).toThrow('found 0');
  });

  it('refuses a root that matches more than one — two originals is not a state', () => {
    expect(() =>
      resolveCanonical(
        [...COPIES, { role: 'second original', path: 'producer/other.json' }],
        'producer/'
      )
    ).toThrow('found 2');
  });
});

describe('checkCopies', () => {
  it('passes identical copies that each hold', () => {
    expect(checkCopies(COPIES, CANONICAL, readerOver(allIdentical()), validate)).toEqual([]);
  });

  it('names the role of a copy that is not on disk', () => {
    const files = allIdentical();
    files.delete(VENDORED);

    const failures = checkCopies(COPIES, CANONICAL, readerOver(files), validate).join('\n');

    expect(failures).toContain(VENDORED);
    expect(failures).toContain('vendored');
    expect(failures).toContain('missing');
  });

  it('reports drift against the canonical copy by name', () => {
    const files = allIdentical().set(VENDORED, JSON.stringify({ ...valid, version: 2 }));

    expect(checkCopies(COPIES, CANONICAL, readerOver(files), validate).join('\n')).toContain(
      `drifted from ${CANONICAL}`
    );
  });

  it('still validates each copy when the canonical one is absent', () => {
    // Independence between the two halves: a missing canonical copy must not
    // take the content assertions down with it.
    const files = new Map([[VENDORED, JSON.stringify({ version: 1, value: 'wrong' })]]);

    const failures = checkCopies(COPIES, CANONICAL, readerOver(files), validate).join('\n');

    expect(failures).toContain(`${CANONICAL}: missing`);
    expect(failures).toContain(`${VENDORED}: value: wrong`);
  });

  it('reports unparseable JSON instead of throwing', () => {
    const files = allIdentical().set(VENDORED, 'not json at all');

    expect(checkCopies(COPIES, CANONICAL, readerOver(files), validate).join('\n')).toContain(
      'not parseable as JSON'
    );
  });
});

describe('selfTestCopyHandling', () => {
  it('passes for a validator and copy set that behave', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(selfTestCopyHandling(COPIES, CANONICAL, valid, validate)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    expect(logs).toHaveBeenCalled();

    errors.mockRestore();
    logs.mockRestore();
  });

  it('fails loudly when drift detection has been neutered', () => {
    // ADR-045: the self-test has to be able to fail. Handing it a comparison
    // that never reports is the only way to watch that happen.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const neutered = () => [];
    const single = [{ role: 'only', path: CANONICAL }];

    expect(selfTestCopyHandling(single, CANONICAL, valid, neutered)).toBe(false);
    expect(errors.mock.calls.flat().join('\n')).toContain('no non-canonical copy to perturb');

    errors.mockRestore();
  });
});

describe('repoCopyReader', () => {
  it('returns null for a file that is not there', () => {
    const fail = vi.fn(() => {
      throw new Error('should not be reached');
    });

    expect(repoCopyReader('/definitely/not/a/repo', fail as never)('nothing.json')).toBeNull();
    expect(fail).not.toHaveBeenCalled();
  });

  it('fails rather than reporting a directory as an absent file', () => {
    // EISDIR, not ENOENT. Collapsing the two prints "not on disk" about a path
    // that is right there and sends the reader to `git status`.
    const messages: string[] = [];
    const fail = ((message: string) => {
      messages.push(message);
      return null;
    }) as never;

    repoCopyReader(process.cwd(), fail)('scripts');

    expect(messages.join('\n')).toContain('cannot read scripts');
  });
});

describe('isFileNotFound', () => {
  it('is true only for ENOENT', () => {
    expect(isFileNotFound({ code: 'ENOENT' })).toBe(true);
    expect(isFileNotFound({ code: 'EACCES' })).toBe(false);
    expect(isFileNotFound(new Error('no code'))).toBe(false);
    expect(isFileNotFound(null)).toBe(false);
    expect(isFileNotFound('ENOENT')).toBe(false);
  });
});
