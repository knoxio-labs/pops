import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkSidecarWiring,
  discoverConfigIds,
  ENV_VAR_EXCEPTIONS,
  extractEnvVarName,
  extractSidecarBlocks,
  extractSidecarIds,
  extractVolumeMounts,
  findDrift,
  parseArgs,
} from '../check-litestream-sidecar-parity.mjs';

describe('extractSidecarIds', () => {
  it('extracts every top-level `<id>-litestream` service id', () => {
    const source = [
      'services:',
      '  finance-api:',
      '    image: ghcr.io/knoxio-labs/pops-finance:main',
      '  finance-litestream:',
      '    image: litestream/litestream:0.3.13',
      '  media-litestream:',
      '    image: litestream/litestream:0.3.13',
      'volumes:',
      '  sqlite-data:',
      '    name: pops-sqlite-data',
    ].join('\n');
    expect(extractSidecarIds(source)).toEqual(['finance', 'media']);
  });

  it('ignores a nested key that happens to share the sidecar suffix', () => {
    const source = [
      'services:',
      '  finance-api:',
      '    environment:',
      '      SOMETHING-litestream: fake',
      'volumes:',
      '  sqlite-data:',
      '    name: pops-sqlite-data',
    ].join('\n');
    expect(extractSidecarIds(source)).toEqual([]);
  });

  it('stops at the next top-level key, ignoring a look-alike key in the section after it', () => {
    const source = [
      'services:',
      '  finance-litestream:',
      '    image: x',
      'volumes:',
      '  ghost-litestream:',
      '    name: pops-ghost-data',
    ].join('\n');
    expect(extractSidecarIds(source)).toEqual(['finance']);
  });

  it('returns nothing when there is no services block', () => {
    expect(extractSidecarIds('volumes:\n  sqlite-data:\n    name: pops-sqlite-data\n')).toEqual([]);
  });
});

describe('findDrift', () => {
  it('reports no drift when every config has a sidecar and vice versa', () => {
    expect(findDrift(['finance', 'media'], ['finance', 'media'])).toEqual({
      missingSidecar: [],
      orphanSidecar: [],
    });
  });

  it('reports a config with no matching sidecar as missingSidecar', () => {
    expect(findDrift(['finance', 'purchases'], ['finance'])).toEqual({
      missingSidecar: ['purchases'],
      orphanSidecar: [],
    });
  });

  it('reports a sidecar with no matching config as orphanSidecar', () => {
    expect(findDrift(['finance'], ['finance', 'ghost'])).toEqual({
      missingSidecar: [],
      orphanSidecar: ['ghost'],
    });
  });
});

describe('discoverConfigIds — fixture tree', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'litestream-parity-'));
    writeFileSync(join(root, 'finance.yml'), 'dbs:\n  - path: /data/sqlite/finance.db\n');
    writeFileSync(join(root, 'media.yml'), 'dbs:\n  - path: /data/sqlite/media.db\n');
    mkdirSync(join(root, 'not-a-config'), { recursive: true });
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('lists every .yml config id, sorted', () => {
    expect(discoverConfigIds(root)).toEqual(['finance', 'media']);
  });

  it('does not list an entry without a `.yml` suffix, subdirectory included', () => {
    expect(discoverConfigIds(root)).not.toContain('not-a-config');
  });
});

describe('parseArgs', () => {
  it('recognises --help and -h', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgs(['-h'])).toEqual({ kind: 'help' });
  });

  it('recognises --self-test', () => {
    expect(parseArgs(['--self-test'])).toEqual({ kind: 'self-test' });
  });

  it('recognises a plain run with no arguments', () => {
    expect(parseArgs([])).toEqual({ kind: 'run' });
  });

  it('rejects an unrecognised argument instead of falling through to a run', () => {
    expect(parseArgs(['--self-tst'])).toEqual({
      kind: 'error',
      message: 'Unrecognised argument: --self-tst',
    });
  });

  it('rejects an unrecognised argument even alongside a recognised one', () => {
    expect(parseArgs(['--self-test', '--bogus'])).toEqual({
      kind: 'error',
      message: 'Unrecognised argument: --bogus',
    });
  });
});

describe('extractVolumeMounts', () => {
  it('reads short-form `source:target:mode` entries', () => {
    const lines = [
      '    volumes:',
      '      - pops-finance-data:/data/sqlite:ro',
      '      - ./litestream/finance.yml:/etc/litestream.yml:ro',
      '    environment:',
      '      FINANCE_LITESTREAM_REPLICA_URL: ${FINANCE_LITESTREAM_REPLICA_URL:-}',
    ];
    expect(extractVolumeMounts(lines)).toEqual([
      { source: 'pops-finance-data', target: '/data/sqlite' },
      { source: './litestream/finance.yml', target: '/etc/litestream.yml' },
    ]);
  });

  it('reads short-form entries with no mode suffix', () => {
    expect(extractVolumeMounts(['    volumes:', '      - pops-finance-data:/data/sqlite'])).toEqual(
      [{ source: 'pops-finance-data', target: '/data/sqlite' }]
    );
  });

  it('reads long-form `type`/`source`/`target` entries', () => {
    const lines = [
      '    volumes:',
      '      - type: volume',
      '        source: pops-finance-data',
      '        target: /data/sqlite',
      '        read_only: true',
      '      - type: bind',
      '        source: ./litestream/finance.yml',
      '        target: /etc/litestream.yml',
      '        read_only: true',
    ];
    expect(extractVolumeMounts(lines)).toEqual([
      { source: 'pops-finance-data', target: '/data/sqlite' },
      { source: './litestream/finance.yml', target: '/etc/litestream.yml' },
    ]);
  });

  it('stops at the next 4-space key, ignoring a look-alike list after it', () => {
    const lines = [
      '    volumes:',
      '      - pops-finance-data:/data/sqlite:ro',
      '    environment:',
      '      FINANCE_LITESTREAM_REPLICA_URL: ${FINANCE_LITESTREAM_REPLICA_URL:-}',
      '    labels:',
      '      - pops-ghost-data:/should/not/be/read:ro',
    ];
    expect(extractVolumeMounts(lines)).toEqual([
      { source: 'pops-finance-data', target: '/data/sqlite' },
    ]);
  });
});

describe('extractEnvVarName', () => {
  it('reads the first key under `environment:`', () => {
    const lines = [
      '    environment:',
      '      FINANCE_LITESTREAM_REPLICA_URL: ${FINANCE_LITESTREAM_REPLICA_URL:-}',
    ];
    expect(extractEnvVarName(lines)).toBe('FINANCE_LITESTREAM_REPLICA_URL');
  });

  it('returns undefined when the service has no environment block', () => {
    expect(
      extractEnvVarName(['    volumes:', '      - pops-finance-data:/data/sqlite:ro'])
    ).toBeUndefined();
  });
});

describe('checkSidecarWiring', () => {
  const bodyOf = (id: string, source: string) =>
    extractSidecarBlocks(source).find((block) => block.id === id)!.lines;

  it('passes a sidecar mounting its own config and volume with its own env var', () => {
    const lines = bodyOf(
      'finance',
      [
        'services:',
        '  finance-litestream:',
        '    volumes:',
        '      - pops-finance-data:/data/sqlite:ro',
        '      - ./litestream/finance.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      FINANCE_LITESTREAM_REPLICA_URL: ${FINANCE_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    expect(checkSidecarWiring('finance', lines)).toEqual([]);
  });

  it("flags a sidecar mounting a different pillar's config — the deceptive case from the ticket", () => {
    const lines = bodyOf(
      'purchases',
      [
        'services:',
        '  purchases-litestream:',
        '    volumes:',
        '      - pops-purchases-data:/data/sqlite:ro',
        '      - ./litestream/finance.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      PURCHASES_LITESTREAM_REPLICA_URL: ${PURCHASES_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    const violations = checkSidecarWiring('purchases', lines);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(
      /\.\/litestream\/finance\.yml.*expected \.\/litestream\/purchases\.yml/
    );
  });

  it("flags a sidecar mounting a different pillar's data volume", () => {
    const lines = bodyOf(
      'purchases',
      [
        'services:',
        '  purchases-litestream:',
        '    volumes:',
        '      - pops-finance-data:/data/sqlite:ro',
        '      - ./litestream/purchases.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      PURCHASES_LITESTREAM_REPLICA_URL: ${PURCHASES_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    const violations = checkSidecarWiring('purchases', lines);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/pops-finance-data.*expected pops-purchases-data/);
  });

  it('flags a sidecar missing the data-volume mount entirely', () => {
    const lines = bodyOf(
      'purchases',
      [
        'services:',
        '  purchases-litestream:',
        '    volumes:',
        '      - ./litestream/purchases.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      PURCHASES_LITESTREAM_REPLICA_URL: ${PURCHASES_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    const violations = checkSidecarWiring('purchases', lines);
    expect(violations).toContainEqual(
      expect.stringContaining('missing a volume mounting /data/sqlite')
    );
  });

  it('honours the documented registry env-var exception', () => {
    const lines = bodyOf(
      'registry',
      [
        'services:',
        '  registry-litestream:',
        '    volumes:',
        '      - pops-registry-data:/data/sqlite:ro',
        '      - ./litestream/registry.yml:/etc/litestream.yml:ro',
        '    environment:',
        `      ${ENV_VAR_EXCEPTIONS.get('registry')}: \${${ENV_VAR_EXCEPTIONS.get('registry')}:-}`,
      ].join('\n')
    );
    expect(checkSidecarWiring('registry', lines)).toEqual([]);
  });

  it('still fails an unlisted id passing the exact same env var shape registry is excused for', () => {
    const lines = bodyOf(
      'unlisted',
      [
        'services:',
        '  unlisted-litestream:',
        '    volumes:',
        '      - pops-unlisted-data:/data/sqlite:ro',
        '      - ./litestream/unlisted.yml:/etc/litestream.yml:ro',
        '    environment:',
        `      ${ENV_VAR_EXCEPTIONS.get('registry')}: \${${ENV_VAR_EXCEPTIONS.get('registry')}:-}`,
      ].join('\n')
    );
    const violations = checkSidecarWiring('unlisted', lines);
    expect(violations).toContainEqual(expect.stringContaining('UNLISTED_LITESTREAM_REPLICA_URL'));
  });
});

describe('against the live repo', () => {
  it('every infra/litestream/<id>.yml has a matching <id>-litestream service, and vice versa', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const here = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(here, '..', '..', '..');
    const litestreamDir = resolve(repoRoot, 'infra', 'litestream');
    const composePath = resolve(repoRoot, 'infra', 'docker-compose.yml');

    const configIds = discoverConfigIds(litestreamDir);
    const sidecarIds = extractSidecarIds(readFileSync(composePath, 'utf8'));

    expect(findDrift(configIds, sidecarIds)).toEqual({ missingSidecar: [], orphanSidecar: [] });
  });

  it('every matched sidecar mounts its own config and data volume', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const here = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(here, '..', '..', '..');
    const composePath = resolve(repoRoot, 'infra', 'docker-compose.yml');

    const blocks = extractSidecarBlocks(readFileSync(composePath, 'utf8'));
    expect(blocks.length).toBeGreaterThan(0);

    const violationsById = Object.fromEntries(
      blocks
        .map((block) => [block.id, checkSidecarWiring(block.id, block.lines)] as const)
        .filter(([, violations]) => violations.length > 0)
    );
    expect(violationsById).toEqual({});
  });
});
