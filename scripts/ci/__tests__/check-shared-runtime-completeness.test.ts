/**
 * ADR-045: a guard ships with a test proving it REPORTS. These drive the pure
 * classification over shapes the guard must flag and shapes it must not, the
 * disk-reading discovery over synthetic trees, and both the guard and its
 * self-test against the real repository — so a candidate walk that silently
 * stops finding pillar apps, or an exemption list that outlives what it
 * described, fails here.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, inject, it } from 'vitest';

import {
  CANDIDATE_FLOOR,
  classify,
  discoverCandidates,
  DUPLICATED_DELIBERATELY,
  extractSharedRuntimeEntryPoints,
  extractSharedRuntimeSpecifiers,
  readDependencies,
} from '../check-shared-runtime-completeness.mjs';
import { passingProofStdout, proofOf } from './real-tree-proofs.js';

interface Tree {
  readonly host?: readonly string[];
  readonly uiKit?: readonly string[];
  readonly apps?: Readonly<Record<string, readonly string[]>>;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function manifest(path: string, name: string, deps: readonly string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ name, dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) })
  );
}

/** A synthetic repo root on disk, so discovery is exercised rather than skipped. */
function tree({ host, uiKit, apps = {} }: Tree): string {
  const root = mkdtempSync(join(tmpdir(), 'shared-runtime-test-'));
  roots.push(root);
  if (host !== undefined) manifest(join(root, 'pillars/shell/package.json'), '@pops/shell', host);
  if (uiKit !== undefined) manifest(join(root, 'libs/ui/package.json'), '@pops/ui', uiKit);
  for (const [pillar, deps] of Object.entries(apps)) {
    manifest(join(root, 'pillars', pillar, 'app/package.json'), `@pops/${pillar}-app`, deps);
  }
  return root;
}

const exemption = (name: string) => ({ package: name, ticket: 'POPS-1', reason: 'fixture' });

describe('discoverCandidates', () => {
  it('is the intersection of the host graph and the pillar apps', () => {
    const root = tree({
      host: ['react', 'vite-only-here'],
      uiKit: [],
      apps: { finance: ['react', 'zustand'], media: ['react'] },
    });
    expect(discoverCandidates(root)).toEqual([{ package: 'react', pillars: ['finance', 'media'] }]);
  });

  it('counts a dependency the host reaches only through libs/ui — how sonner got in', () => {
    const root = tree({ host: [], uiKit: ['sonner'], apps: { media: ['sonner'] } });
    expect(discoverCandidates(root).map((c) => c.package)).toEqual(['sonner']);
  });

  it('ignores devDependencies, which are in neither bundle', () => {
    const root = tree({ host: [], uiKit: [], apps: {} });
    manifest(join(root, 'pillars/shell/package.json'), '@pops/shell', []);
    writeFileSync(
      join(root, 'pillars/shell/package.json'),
      JSON.stringify({ name: '@pops/shell', devDependencies: { vitest: '*' } })
    );
    manifest(join(root, 'pillars/media/app/package.json'), '@pops/media-app', ['vitest']);
    expect(discoverCandidates(root)).toEqual([]);
  });

  it('throws when no pillar app manifest is readable, rather than reporting a clean tree', () => {
    const root = tree({ host: ['react'], uiKit: [] });
    expect(() => discoverCandidates(root)).toThrow(/read 0 pillars/u);
  });

  it('throws when a host manifest is missing', () => {
    const root = tree({ uiKit: ['react'], apps: { media: ['react'] } });
    expect(() => discoverCandidates(root)).toThrow(/host manifest/u);
  });

  it('throws when a manifest is unparseable, rather than treating it as dependency-free', () => {
    const root = tree({ host: ['react'], uiKit: [], apps: { media: ['react'] } });
    writeFileSync(join(root, 'pillars/media/app/package.json'), '{ not json');
    expect(() => discoverCandidates(root)).toThrow();
  });

  it('rejects a "dependencies" that is not an object', () => {
    const root = tree({ host: [], uiKit: [] });
    writeFileSync(
      join(root, 'pillars/shell/package.json'),
      JSON.stringify({ name: '@pops/shell', dependencies: ['react'] })
    );
    expect(() => readDependencies(join(root, 'pillars/shell/package.json'))).toThrow(
      /not an object/u
    );
  });
});

describe('classify', () => {
  const candidate = (name: string) => ({ package: name, pillars: ['finance'] });

  it('passes a candidate that is externalised, and one that is exempted', () => {
    const findings = classify(
      [candidate('react'), candidate('lucide-react')],
      ['react'],
      ['react'],
      [exemption('lucide-react')]
    );
    expect(findings.unclassified).toEqual([]);
    expect(findings.staleExemptions).toEqual([]);
  });

  it('flags a candidate on neither list — the POPS-3320 shape', () => {
    const findings = classify([candidate('sonner')], ['react'], ['react'], []);
    expect(findings.unclassified.map((c) => c.package)).toEqual(['sonner']);
  });

  it('flags an exemption for a package that is no longer shared', () => {
    const findings = classify([candidate('react')], ['react'], ['react'], [exemption('gone')]);
    expect(findings.staleExemptions).toEqual(['gone']);
  });

  it('flags a package claimed by both lists at once', () => {
    const findings = classify([candidate('react')], ['react'], ['react'], [exemption('react')]);
    expect(findings.contradictory).toEqual(['react']);
  });

  it('flags a specifier the host cannot actually serve', () => {
    const findings = classify([candidate('sonner')], ['sonner'], [], []);
    expect(findings.missingEntryPoint).toEqual(['sonner']);
  });
});

describe('the shared-runtime declarations', () => {
  const source = () => readFileSync('libs/sdk/src/remote-build/index.ts', 'utf8');

  it('parses both lists out of the real source', () => {
    const text = source();
    expect(extractSharedRuntimeSpecifiers(text)).toContain('sonner');
    expect(extractSharedRuntimeEntryPoints(text)).toContain('react/jsx-runtime');
  });

  it('throws on a renamed declaration rather than yielding an empty list', () => {
    expect(() => extractSharedRuntimeSpecifiers('export const OTHER = [];')).toThrow(/reshaped/u);
    expect(() => extractSharedRuntimeEntryPoints('export const OTHER = [];')).toThrow(/reshaped/u);
  });
});

describe('DUPLICATED_DELIBERATELY', () => {
  it('is not empty — an empty allowlist would make the by-name rule vacuous', () => {
    expect(DUPLICATED_DELIBERATELY.length).toBeGreaterThan(0);
  });

  it('names a ticket and a reason of substance on every row', () => {
    for (const entry of DUPLICATED_DELIBERATELY) {
      expect(entry.ticket, entry.package).toMatch(/^POPS-\d+$/u);
      expect(entry.reason.length, entry.package).toBeGreaterThanOrEqual(60);
    }
  });

  it('rejects the reasons that were true of sonner too', () => {
    for (const entry of DUPLICATED_DELIBERATELY) {
      expect(entry.reason.toLowerCase(), entry.package).not.toMatch(
        /^(it is )?(harmless|small|stateless)\.?$/u
      );
    }
  });

  it('lists each package once', () => {
    const names = DUPLICATED_DELIBERATELY.map((e) => e.package);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the guard proves itself', () => {
  it('passes its own --self-test', () => {
    const output = passingProofStdout(
      inject('realTreeProofs'),
      'check-shared-runtime-completeness:self-test'
    );
    expect(output).toMatch(/self-test OK/u);
  });

  it('passes on the real tree and says how much it looked at', () => {
    const result = proofOf(inject('realTreeProofs'), 'check-shared-runtime-completeness');
    expect(
      result.status,
      'guard exited nonzero against the committed lists — a package became shared between the ' +
        'shell and a pillar app without anyone deciding whether it must be externalised. Run ' +
        '`pnpm check:shared-runtime` to see which.' +
        `\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
    ).toBe(0);
    const scanned = Number(/Scanned (\d+) package\(s\)/u.exec(result.stdout)?.[1]);
    expect(scanned).toBeGreaterThanOrEqual(CANDIDATE_FLOOR);
  });
});
