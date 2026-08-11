import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  discoverConfigIds,
  extractSidecarIds,
  findDrift,
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

  it('stops at the next top-level key even with no trailing section', () => {
    const source = ['services:', '  finance-litestream:', '    image: x'].join('\n');
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
});
