import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkNodePin,
  collectDockerfilePins,
  collectPins,
  collectWorkflowPins,
  nodeMajor,
  REQUIRED_MISE_SETTINGS,
} from '../check-node-pin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const COHERENT_MISE = '[settings]\nactivate_aggressive = true\n\n[tools]\nnode = "24.19.0"\n';

/**
 * Build a fixture repo whose Node pins are all major 24 unless a caller
 * overrides one of them.
 */
function makeFixture(overrides: {
  mise?: string;
  ciMise?: string;
  engines?: string | null;
  workflow?: string;
  dockerfile?: string;
}): string {
  const root = mkdtempSync(join(tmpdir(), 'node-pin-'));
  writeFileSync(join(root, 'mise.toml'), overrides.mise ?? COHERENT_MISE);
  writeFileSync(join(root, 'mise.ci.toml'), overrides.ciMise ?? '[tools]\nnode = "24"\n');

  const manifest: { name: string; engines?: { node: string } } = { name: 'fixture' };
  if (overrides.engines !== null) manifest.engines = { node: overrides.engines ?? '^24' };
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));

  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(root, '.github', 'workflows', 'quality.yml'),
    overrides.workflow ?? 'jobs:\n  a:\n    steps:\n      - with:\n          node-version: "24"\n'
  );

  mkdirSync(join(root, 'pillars', 'finance'), { recursive: true });
  writeFileSync(
    join(root, 'pillars', 'finance', 'Dockerfile'),
    overrides.dockerfile ?? 'FROM node:24-slim AS builder\nRUN echo hi\nFROM node:24-slim\n'
  );
  return root;
}

describe('nodeMajor', () => {
  it('reads a bare major', () => expect(nodeMajor('24')).toBe('24'));
  it('reads an exact version', () => expect(nodeMajor('24.19.0')).toBe('24'));
  it('reads a caret range', () => expect(nodeMajor('^24')).toBe('24'));
  it('reads a >= range', () => expect(nodeMajor('>=24.1')).toBe('24'));
  it('reads a docker tag suffix', () => expect(nodeMajor('24-slim')).toBe('24'));
  it('reads an alpine tag suffix', () => expect(nodeMajor('24-alpine')).toBe('24'));
  it('tolerates surrounding whitespace', () => expect(nodeMajor('  24.5.0 ')).toBe('24'));
  it('returns null when there is no major to read', () => expect(nodeMajor('lts/*')).toBeNull());
});

describe('collectWorkflowPins', () => {
  let root: string;
  beforeAll(() => {
    root = makeFixture({
      workflow: [
        'jobs:',
        '  a:',
        '    steps:',
        '      - uses: actions/setup-node@v7',
        '        with:',
        '          node-version: "24"',
        '  b:',
        '    steps:',
        '      - with:',
        '          node-version: 22',
      ].join('\n'),
    });
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds every node-version in a workflow, quoted or bare', () => {
    expect(collectWorkflowPins(root).pins.map((pin) => pin.expression)).toEqual(['24', '22']);
  });

  it('returns nothing when there is no workflows dir', () => {
    const bare = mkdtempSync(join(tmpdir(), 'node-pin-bare-'));
    try {
      expect(collectWorkflowPins(bare)).toEqual({ pins: [], problems: [] });
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('finds a pin written as a flow mapping, which a line matcher stepped past', () => {
    const flow = makeFixture({
      workflow: 'jobs:\n  a:\n    steps:\n      - { uses: setup-node, with: { node-version: 24 } }\n',
    });
    try {
      expect(collectWorkflowPins(flow).pins.map((pin) => pin.expression)).toEqual(['24']);
    } finally {
      rmSync(flow, { recursive: true, force: true });
    }
  });

  it('reports a workflow that does not parse rather than collecting no pin from it', () => {
    const broken = makeFixture({ workflow: 'jobs:\n  a:\n   - b\n  - c\n' });
    try {
      const { pins, problems } = collectWorkflowPins(broken);
      expect(pins).toEqual([]);
      expect(problems.some((p) => p.includes('could not be parsed'))).toBe(true);
      expect(checkNodePin(broken).violations.some((v) => v.includes('could not be parsed'))).toBe(
        true
      );
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it('reports a node-version the coherence check cannot rule on', () => {
    const matrix = makeFixture({
      workflow: 'jobs:\n  a:\n    steps:\n      - with:\n          node-version: [22, 24]\n',
    });
    try {
      const { problems } = collectWorkflowPins(matrix);
      expect(problems.some((p) => p.includes('as a sequence'))).toBe(true);
    } finally {
      rmSync(matrix, { recursive: true, force: true });
    }
  });
});

describe('collectDockerfilePins', () => {
  let root: string;
  beforeAll(() => {
    root = makeFixture({ dockerfile: 'FROM node:24-slim AS builder\nFROM node:22-alpine\n' });
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('finds every FROM node: stage, including multi-stage builds', () => {
    expect(collectDockerfilePins(root).map((pin) => pin.expression)).toEqual([
      '24-slim',
      '22-alpine',
    ]);
  });

  it('ignores a FROM that is not a node base image', () => {
    const other = makeFixture({ dockerfile: 'FROM rust:1.97 AS builder\nFROM node:24-slim\n' });
    try {
      expect(collectDockerfilePins(other).map((pin) => pin.expression)).toEqual(['24-slim']);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('checkNodePin — fixture tree', () => {
  it('passes when every pin names the same major', () => {
    const root = makeFixture({});
    try {
      const report = checkNodePin(root);
      expect(report.violations).toEqual([]);
      expect(report.majors).toEqual(['24']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a mise.toml pin that drifts from the rest', () => {
    const root = makeFixture({
      mise: '[settings]\nactivate_aggressive = true\n\n[tools]\nnode = "26.5.0"\n',
    });
    try {
      const { violations } = checkNodePin(root);
      expect(violations.some((v) => v.includes('disagree'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a Dockerfile left behind on an older major', () => {
    const root = makeFixture({ dockerfile: 'FROM node:22-slim\n' });
    try {
      expect(checkNodePin(root).violations.some((v) => v.includes('disagree'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a workflow left behind on an older major', () => {
    const root = makeFixture({
      workflow: 'jobs:\n  a:\n    steps:\n      - with:\n          node-version: "22"\n',
    });
    try {
      expect(checkNodePin(root).violations.some((v) => v.includes('disagree'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a missing engines.node — the state that let this defect exist', () => {
    const root = makeFixture({ engines: null });
    try {
      expect(checkNodePin(root).violations.some((v) => v.includes('engines.node'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags an engines.node that allows a major nothing else ships', () => {
    const root = makeFixture({ engines: '^26' });
    try {
      expect(checkNodePin(root).violations.some((v) => v.includes('disagree'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a dropped activate_aggressive setting', () => {
    const root = makeFixture({ mise: '[tools]\nnode = "24.19.0"\n' });
    try {
      expect(checkNodePin(root).violations.some((v) => v.includes('activate_aggressive'))).toBe(
        true
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags activate_aggressive explicitly turned off', () => {
    const root = makeFixture({
      mise: '[settings]\nactivate_aggressive = false\n\n[tools]\nnode = "24.19.0"\n',
    });
    try {
      expect(checkNodePin(root).violations.some((v) => v.includes('activate_aggressive'))).toBe(
        true
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a pin whose major cannot be read at all', () => {
    const root = makeFixture({ ciMise: '[tools]\nnode = "lts/*"\n' });
    try {
      expect(checkNodePin(root).violations.some((v) => v.includes('no readable major'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('against the live repo', () => {
  it('every declared Node pin names one major', () => {
    expect(checkNodePin(repoRoot).violations).toEqual([]);
  });

  it('reads every workflow without a single parse problem', () => {
    expect(collectPins(repoRoot).problems).toEqual([]);
  });

  it('collects a pin from each of the five declaration sites', () => {
    const sources = collectPins(repoRoot).pins.map((pin) => pin.source);
    expect(sources).toContain('mise.toml');
    expect(sources).toContain('mise.ci.toml');
    expect(sources).toContain('package.json engines.node');
    expect(sources.some((source) => source.startsWith('.github/workflows/'))).toBe(true);
    expect(sources.some((source) => source.endsWith('Dockerfile'))).toBe(true);
  });

  it('root package.json declares engines.node', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(manifest.engines?.node).toBeTypeOf('string');
  });

  it('pnpm-workspace.yaml turns engines into a refusal, not a warning', () => {
    const workspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/^engineStrict:\s*true$/mu);
  });

  it('the guard exits 0 on the real tree', () => {
    const stdout = execFileSync('node', [join(repoRoot, 'scripts/ci/check-node-pin.mjs')], {
      encoding: 'utf8',
    });
    expect(stdout).toContain('OK —');
  });

  it('its self-test passes', () => {
    expect(() =>
      execFileSync('node', [join(repoRoot, 'scripts/ci/check-node-pin.mjs'), '--self-test'], {
        stdio: 'ignore',
      })
    ).not.toThrow();
  });
});

describe('REQUIRED_MISE_SETTINGS', () => {
  it('keeps activate_aggressive load-bearing', () => {
    expect(REQUIRED_MISE_SETTINGS.activate_aggressive).toBe('true');
  });
});
