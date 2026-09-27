import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  analyzeSources,
  ERROR_CODE_PATTERN,
  formatFindings,
  maskNonCode,
  readGitSources,
} from '../check-error-codes.mjs';
import { commit, fixtureRepo, write } from './git-fixture.js';

const here = dirname(fileURLToPath(import.meta.url));
const guardPath = resolve(here, '..', 'check-error-codes.mjs');
const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const directory = created.pop();
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
});

const passingSource = {
  path: 'pillars/demo/src/api/errors.ts',
  text: `
    import { defineErrors, PopsError } from '@pops/pillar-express';
    const demoErrors = defineErrors('demo', {
      ok: { area: 'request', status: 400, message: 'No.', retryable: false },
    });
    export function fail() {
      throw demoErrors.ok();
    }
    export function explicit() {
      throw new PopsError({ code: 'demo.request.ok', status: 400, message: 'No.', retryable: false });
    }
  `,
};

describe('check-error-codes', () => {
  it('recognises the ADR-054 format and rejects class-shaped codes', () => {
    expect(ERROR_CODE_PATTERN.test('inventory.media.not_found')).toBe(true);
    expect(ERROR_CODE_PATTERN.test('NotFoundError')).toBe(false);
    expect(ERROR_CODE_PATTERN.test('inventory.media.not-found')).toBe(false);
  });

  it('does not scan commented or quoted examples as code', () => {
    const masked = maskNonCode(`// code: 'demo.request.comment'\nconst text = "code: error.name";`);
    expect(masked).not.toContain('demo.request.comment');
    expect(masked).not.toContain('error.name');
  });

  it('accepts a passing registration and throw tree', () => {
    expect(analyzeSources([passingSource]).findings).toEqual([]);
  });

  it('accepts client-owned web and iOS codes without a pillar registry', () => {
    const result = analyzeSources([
      {
        path: 'pillars/shell/src/app/errors.ts',
        text: "const error = { code: 'web.client.unknown' };",
      },
      {
        path: 'pillars/bfm/src/api/errors.ts',
        text: "const error = { code: 'ios.decode.failed' };",
      },
    ]);

    expect(result.findings).toEqual([]);
  });

  it('reports a thrown code that is not registered', () => {
    const result = analyzeSources([
      passingSource,
      {
        path: 'pillars/demo/src/api/unregistered.ts',
        text: "throw new PopsError({ code: 'demo.request.missing', status: 400, message: 'No.', retryable: false });",
      },
    ]);
    expect(formatFindings(result.findings)).toContain('unregistered');
    expect(formatFindings(result.findings)).toContain('demo.request.missing');
  });

  it('reports a code removed from the base registry', () => {
    const result = analyzeSources(
      [passingSource],
      [
        {
          path: passingSource.path,
          text: "const demoErrors = defineErrors('demo', { removed: { area: 'request', status: 400, message: 'No.', retryable: false } });",
        },
      ]
    );
    expect(result.findings.some((finding) => finding.rule === 'removed')).toBe(true);
  });

  it('reports an invalid registered code format', () => {
    const result = analyzeSources([
      {
        path: passingSource.path,
        text: "const demoErrors = defineErrors('demo', { bad: { area: 'Bad-Area', status: 400, message: 'No.', retryable: false } });",
      },
    ]);
    expect(result.findings.some((finding) => finding.rule === 'invalid-format')).toBe(true);
  });

  it('reports code derived from an exception name', () => {
    const result = analyzeSources([
      {
        path: 'pillars/demo/src/api/mapping.ts',
        text: 'export function map(error) { return { code: error.name, message: error.message }; }',
      },
    ]);
    expect(result.findings.some((finding) => finding.rule === 'class-name-derivation')).toBe(true);
  });

  it('reads revision-prefixed git grep paths as repository-relative paths', () => {
    const root = fixtureRepo();
    created.push(root);
    const source = "const demoErrors = defineErrors('demo', { ok: { area: 'request' } });";
    write(root, 'pillars/demo/src/api/errors.ts', source);
    commit(root, 'add error registration');
    execFileSync('git', ['-C', root, 'update-ref', 'refs/remotes/origin/main', 'main']);

    expect(readGitSources(root, 'origin/main')).toEqual([
      { path: 'pillars/demo/src/api/errors.ts', text: source },
    ]);
  });

  it('runs the exact CLI self-test', () => {
    const output = execFileSync(process.execPath, [guardPath, '--self-test'], { encoding: 'utf8' });
    expect(output).toContain('self-test OK');
  }, 60_000);
});
