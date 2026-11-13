/**
 * How the EX-2 sandbox inherits the root's install-script allowlist.
 *
 * `rootAllowBuilds` used to match `pnpm-workspace.yaml` line by line, anchored
 * on `allowBuilds:` at exactly zero indent with nothing after the colon, and
 * returned `[]` for anything else — a value indistinguishable from "the root
 * declares none". Every spelling below except the first produced that, which
 * meant a sandbox installing under an empty allowlist while the workspace
 * enforces five entries. The script's own docstring says why that matters: the
 * sandbox would then prove a build under a policy the real workspace does not
 * use, which is not an honest proof.
 *
 * Today's file is the block form, so the defect was latent — a formatter run
 * or a routine edit was enough. These cases are the spellings a formatter or
 * an editor can produce, not hypotheticals.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import {
  copyRootPatchFiles,
  rootAllowBuilds,
  rootPatchedDependencies,
  sandboxWorkspaceYaml,
} from '../rewrite-deps.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const BLOCK = ['allowBuilds:', '  esbuild: true', '  sharp: true', ''].join('\n');
const EXPECTED = { esbuild: true, sharp: true };

describe('rootAllowBuilds', () => {
  it('reads the block form the file uses today', () => {
    expect(rootAllowBuilds(BLOCK)).toEqual(EXPECTED);
  });

  it('reads the flow form', () => {
    expect(rootAllowBuilds('allowBuilds: { esbuild: true, sharp: true }\n')).toEqual(EXPECTED);
  });

  it('reads a key with a trailing comment', () => {
    expect(
      rootAllowBuilds(
        ['allowBuilds: # supply-chain gate', '  esbuild: true', '  sharp: true', ''].join('\n')
      )
    ).toEqual(EXPECTED);
  });

  it('reads a quoted key', () => {
    expect(
      rootAllowBuilds(["'allowBuilds':", '  esbuild: true', '  sharp: true', ''].join('\n'))
    ).toEqual(EXPECTED);
  });

  it('keeps every entry across a blank line inside the block', () => {
    expect(
      rootAllowBuilds(['allowBuilds:', '  esbuild: true', '', '  sharp: true', ''].join('\n'))
    ).toEqual(EXPECTED);
  });

  it('keeps every entry across a column-0 comment inside the block', () => {
    expect(
      rootAllowBuilds(
        ['allowBuilds:', '  esbuild: true', '# a note at column 0', '  sharp: true', ''].join('\n')
      )
    ).toEqual(EXPECTED);
  });

  it('reads entries the allowlist deliberately blocks, not only the true ones', () => {
    expect(rootAllowBuilds(['allowBuilds:', '  msgpackr-extract: false', ''].join('\n'))).toEqual({
      'msgpackr-extract': false,
    });
  });

  it('returns null — not an empty map — when the root declares none', () => {
    expect(rootAllowBuilds('packages:\n  - libs/*\n')).toBeNull();
  });

  it('throws rather than guessing when allowBuilds is not a mapping', () => {
    expect(() => rootAllowBuilds('allowBuilds:\n  - esbuild\n')).toThrow(/sequence/u);
    expect(() => rootAllowBuilds('allowBuilds: true\n')).toThrow(/boolean/u);
  });

  it('throws when the file itself is not a mapping', () => {
    expect(() => rootAllowBuilds('- just\n- a list\n')).toThrow(/does not parse to a mapping/u);
  });

  it("agrees with the repo's own pnpm-workspace.yaml", () => {
    // Anchors the parser to reality rather than to fixtures alone: if the root
    // stops declaring an allowlist, or declares one this cannot read, that is
    // the sandbox's proof weakening and it should fail here first.
    const real = rootAllowBuilds(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'));

    expect(real).not.toBeNull();
    expect(Object.keys(real ?? {}).length).toBeGreaterThan(0);
    expect(real).toMatchObject({ esbuild: true });
  });
});

describe('sandboxWorkspaceYaml', () => {
  it('makes the sandbox its own workspace root', () => {
    // `packages: []` is what replaced `--ignore-workspace`, which would now
    // ignore this very file.
    expect(parseYaml(sandboxWorkspaceYaml({}, null))).toEqual({ packages: [] });
  });

  it('carries the allowlist through verbatim', () => {
    expect(parseYaml(sandboxWorkspaceYaml({}, EXPECTED))).toEqual({
      packages: [],
      allowBuilds: EXPECTED,
    });
  });

  it('pins every packed dep to its tarball', () => {
    expect(parseYaml(sandboxWorkspaceYaml({ '@pops/types': '/tmp/types.tgz' }, null))).toEqual({
      packages: [],
      overrides: { '@pops/types': 'file:/tmp/types.tgz' },
    });
  });

  it('survives a tarball path containing a quote', () => {
    // The old emitter wrapped the value in single quotes by hand, so this
    // produced a workspace file that did not parse — and the sandbox then
    // failed for a reason with nothing to do with the unit under test.
    const path = "/tmp/o'brien/types.tgz";

    expect(parseYaml(sandboxWorkspaceYaml({ '@pops/types': path }, null))).toEqual({
      packages: [],
      overrides: { '@pops/types': `file:${path}` },
    });
  });
});

describe('sandbox dependency patches', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  function fixture() {
    const root = mkdtempSync(join(repoRoot, 'tmp/ex2-patches-'));
    roots.push(root);
    const source = join(root, 'source');
    const destination = join(root, 'sandbox');
    mkdirSync(source);
    mkdirSync(destination);
    return { source, destination };
  }
  it('preserves the exact authoritative map in the isolated workspace and stages its bytes', () => {
    const { source, destination } = fixture();
    const mapping = rootPatchedDependencies(
      'patchedDependencies:\n  tool@1.2.3: patches/nested/tool.patch\n  tool@1.2.4: patches/nested/tool.patch\n'
    );
    mkdirSync(join(source, 'patches/nested'), { recursive: true });
    writeFileSync(join(source, 'patches/nested/tool.patch'), 'fixture patch bytes\n');
    copyRootPatchFiles(destination, mapping, source);
    expect(readFileSync(join(destination, 'patches/nested/tool.patch'), 'utf8')).toBe(
      'fixture patch bytes\n'
    );
    expect(parseYaml(sandboxWorkspaceYaml({}, null, mapping))).toEqual({
      packages: [],
      patchedDependencies: mapping,
    });
  });
  it('keeps an absent policy distinct from a malformed or escaping mapping', () => {
    expect(rootPatchedDependencies('packages: []\n')).toBeNull();
    for (const value of [
      'null',
      'true',
      '[]',
      '{tool: null}',
      '{tool: ""}',
      '{tool: /absolute.patch}',
      '{tool: ../outside.patch}',
    ]) {
      expect(() => rootPatchedDependencies(`patchedDependencies: ${value}\n`)).toThrow();
    }
  });
  it('rejects missing sources before staging any files', () => {
    const { source, destination } = fixture();
    mkdirSync(join(source, 'patches'));
    writeFileSync(join(source, 'patches/present.patch'), 'present');
    expect(() =>
      copyRootPatchFiles(
        destination,
        { first: 'patches/present.patch', second: 'patches/missing.patch' },
        source
      )
    ).toThrow();
    expect(existsSync(join(destination, 'patches'))).toBe(false);
  });
  it('rejects source and destination symlink escapes and preserves existing destinations', () => {
    const { source, destination } = fixture();
    const outside = join(source, '../outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'patch'), 'outside');
    symlinkSync(outside, join(source, 'escape'));
    expect(() => copyRootPatchFiles(destination, { tool: 'escape/patch' }, source)).toThrow(
      /escapes/u
    );
    mkdirSync(join(source, 'patches'));
    writeFileSync(join(source, 'patches/tool.patch'), 'authoritative');
    symlinkSync(outside, join(destination, 'patches'));
    expect(() => copyRootPatchFiles(destination, { tool: 'patches/tool.patch' }, source)).toThrow(
      /escapes/u
    );
    mkdirSync(join(source, 'patches/nested'));
    writeFileSync(join(source, 'patches/nested/tool.patch'), 'nested');
    expect(() =>
      copyRootPatchFiles(destination, { tool: 'patches/nested/tool.patch' }, source)
    ).toThrow(/escapes/u);
    expect(existsSync(join(outside, 'nested'))).toBe(false);
    expect(readFileSync(join(outside, 'patch'), 'utf8')).toBe('outside');
    rmSync(join(destination, 'patches'));
    mkdirSync(join(destination, 'patches'));
    writeFileSync(join(destination, 'patches/tool.patch'), 'owned');
    expect(() => copyRootPatchFiles(destination, { tool: 'patches/tool.patch' }, source)).toThrow();
    expect(readFileSync(join(destination, 'patches/tool.patch'), 'utf8')).toBe('owned');
  });
});
