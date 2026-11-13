import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkSidecarWiring,
  discoverConfigIds,
  extractEnvVarName,
  extractSidecarBlocks,
  extractServiceBlocks,
  extractSidecarIds,
  extractVolumeMounts,
  extractWriterMounts,
  findDrift,
  parseArgs,
} from '../check-litestream-sidecar-parity.mjs';
import { declaredDatabasePaths } from '../litestream-storage.mjs';

const fixtureConfig = 'dbs:\n  - path: /data/sqlite/fixture.db\n';

function writerAt(id: string, target = '/data/sqlite') {
  return [[{ source: `pops-${id}-data`, target, readOnly: false, isBind: false }]];
}

describe('service-level Compose comments', () => {
  it('keeps actual leading/interspersed comment and blank lines out of declaration rejection', () => {
    const source = [
      'services:',
      '  # ── JOB QUEUE ──',
      '',
      '  archive-api:',
      '    build:',
      '      dockerfile: pillars/archive/Dockerfile',
      '    volumes:',
      '      - pops-archive-data:/data/archive',
      '  # Backup readers remain separate services',
      '',
      '  archive-litestream:',
      '    volumes:',
      '      - pops-archive-data:/data/archive:ro',
    ].join('\n');
    expect(extractServiceBlocks(source).map((block) => block.id)).toEqual([
      'archive-api',
      'archive-litestream',
    ]);
    expect(extractSidecarIds(source)).toEqual(['archive']);
    expect(extractWriterMounts('archive', source, ['/data/archive/nested/receipts.db'])).toEqual([
      [{ source: 'pops-archive-data', target: '/data/archive', readOnly: false, isBind: false }],
    ]);
  });

  it.each(['  "archive-api": {}', '  archive-api: {}'])(
    'still refuses an unsupported real declaration: %s',
    (declaration) => {
      expect(() =>
        extractServiceBlocks(`services:\n  # A comment is allowed\n${declaration}\n`)
      ).toThrow(/Unsupported Compose service declaration/u);
    }
  );
});

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
      { source: 'pops-finance-data', target: '/data/sqlite', readOnly: true, isBind: false },
      {
        source: './litestream/finance.yml',
        target: '/etc/litestream.yml',
        readOnly: true,
        isBind: true,
      },
    ]);
  });

  it('reads short-form entries with no mode suffix', () => {
    expect(extractVolumeMounts(['    volumes:', '      - pops-finance-data:/data/sqlite'])).toEqual(
      [{ source: 'pops-finance-data', target: '/data/sqlite', readOnly: false, isBind: false }]
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
      { source: 'pops-finance-data', target: '/data/sqlite', readOnly: true, isBind: false },
      {
        source: './litestream/finance.yml',
        target: '/etc/litestream.yml',
        readOnly: true,
        isBind: true,
      },
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
      { source: 'pops-finance-data', target: '/data/sqlite', readOnly: true, isBind: false },
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
        '      - pops-finance-data:/data/sqlite',
        '      - ./litestream/finance.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      FINANCE_LITESTREAM_REPLICA_URL: ${FINANCE_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    expect(checkSidecarWiring('finance', lines, fixtureConfig, writerAt('finance'))).toEqual([]);
  });

  it("flags a sidecar mounting a different pillar's config — the deceptive case from the ticket", () => {
    const lines = bodyOf(
      'purchases',
      [
        'services:',
        '  purchases-litestream:',
        '    volumes:',
        '      - pops-purchases-data:/data/sqlite',
        '      - ./litestream/finance.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      PURCHASES_LITESTREAM_REPLICA_URL: ${PURCHASES_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    const violations = checkSidecarWiring('purchases', lines, fixtureConfig, writerAt('purchases'));
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
        '      - pops-finance-data:/data/sqlite',
        '      - ./litestream/purchases.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      PURCHASES_LITESTREAM_REPLICA_URL: ${PURCHASES_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    const violations = checkSidecarWiring('purchases', lines, fixtureConfig, writerAt('purchases'));
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
    const violations = checkSidecarWiring('purchases', lines, fixtureConfig, writerAt('purchases'));
    expect(violations).toContainEqual(
      expect.stringContaining('missing a volume mounting /data/sqlite')
    );
  });

  it('flags registry using its former core replica-URL variable', () => {
    const lines = bodyOf(
      'registry',
      [
        'services:',
        '  registry-litestream:',
        '    volumes:',
        '      - pops-registry-data:/data/sqlite',
        '      - ./litestream/registry.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      CORE_LITESTREAM_REPLICA_URL: ${CORE_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    const violations = checkSidecarWiring('registry', lines, fixtureConfig, writerAt('registry'));
    expect(violations).toContainEqual(
      expect.stringContaining('expected REGISTRY_LITESTREAM_REPLICA_URL')
    );
  });

  it("flags a sidecar using another pillar's replica-URL variable", () => {
    const lines = bodyOf(
      'unlisted',
      [
        'services:',
        '  unlisted-litestream:',
        '    volumes:',
        '      - pops-unlisted-data:/data/sqlite',
        '      - ./litestream/unlisted.yml:/etc/litestream.yml:ro',
        '    environment:',
        '      CORE_LITESTREAM_REPLICA_URL: ${CORE_LITESTREAM_REPLICA_URL:-}',
      ].join('\n')
    );
    const violations = checkSidecarWiring('unlisted', lines, fixtureConfig, writerAt('unlisted'));
    expect(violations).toContainEqual(expect.stringContaining('UNLISTED_LITESTREAM_REPLICA_URL'));
  });
});

describe('declared database wiring boundaries', () => {
  const config = 'dbs:\n  - path: /data/archive/receipts.db\n';
  const lines = [
    '    volumes:',
    '      - pops-archive-data:/data/archive',
    '      - ./litestream/archive.yml:/etc/litestream.yml:ro',
    '    environment:',
    '      ARCHIVE_LITESTREAM_REPLICA_URL: ${ARCHIVE_LITESTREAM_REPLICA_URL:-}',
  ];
  it('uses an actual non-sqlite DATA declaration for any owner', () => {
    expect(
      checkSidecarWiring('archive', lines, config, writerAt('archive', '/data/archive'))
    ).toEqual([]);
  });
  it('rejects a read-only backup and invalid declarations', () => {
    expect(
      checkSidecarWiring(
        'archive',
        lines.map((line) => line.replace(':/data/archive', ':/data/archive:ro')),
        config,
        writerAt('archive', '/data/archive')
      ).length
    ).toBeGreaterThan(0);
    expect(
      checkSidecarWiring('archive', lines, 'dbs: []', writerAt('archive', '/data/archive')).length
    ).toBeGreaterThan(0);
  });
  it('does not ignore an unsupported long mount capable of hiding the database', () => {
    expect(() =>
      extractVolumeMounts([
        '    volumes:',
        '      - source: unknown',
        '        target: /data/archive/receipts.db',
      ])
    ).toThrow();
  });
  it('keeps anonymous and host-bind shadow mounts visible to the DB check', () => {
    const shadows = ['      - type: tmpfs', '        target: /data/archive/receipts.db'];
    const withShadow = [...lines.slice(0, 3), ...shadows, ...lines.slice(3)];
    expect(
      checkSidecarWiring('archive', withShadow, config, writerAt('archive', '/data/archive')).length
    ).toBeGreaterThan(0);
  });
});

describe('physical writer/backup mount identity', () => {
  function fixture(backupTarget: string, options: string[] = []) {
    return [
      'services:',
      '  archive-api:',
      '    build:',
      '      dockerfile: pillars/archive/Dockerfile',
      '    volumes:',
      '      - pops-archive-data:/data/archive',
      '  archive-litestream:',
      '    volumes:',
      '      - type: volume',
      '        source: pops-archive-data',
      `        target: ${backupTarget}`,
      '        read_only: false',
      ...options,
      '      - ./litestream/archive.yml:/etc/litestream.yml:ro',
      '    environment:',
      '      ARCHIVE_LITESTREAM_REPLICA_URL: ${ARCHIVE_LITESTREAM_REPLICA_URL:-}',
    ].join('\n');
  }

  it('rejects a backup targeting a different relative file on the same DATA volume', () => {
    const source = fixture('/data/archive/nested');
    const block = extractSidecarBlocks(source)[0];
    expect(block).toBeDefined();
    expect(
      checkSidecarWiring(
        'archive',
        block?.lines ?? [],
        'dbs:\n  - path: /data/archive/nested/receipts.db\n',
        extractWriterMounts('archive', source, ['/data/archive/nested/receipts.db'])
      )
    ).toContainEqual(expect.stringContaining('different volume-relative database paths'));
  });

  it('keeps correctly aligned nested files valid', () => {
    const source = fixture('/data/archive');
    const block = extractSidecarBlocks(source)[0];
    expect(
      checkSidecarWiring(
        'archive',
        block?.lines ?? [],
        'dbs:\n  - path: /data/archive/nested/receipts.db\n',
        extractWriterMounts('archive', source, ['/data/archive/nested/receipts.db'])
      )
    ).toEqual([]);
  });

  it.each(
    [
      ['        volume:', '          subpath: another-folder'],
      ['        volume: {subpath: another-folder}'],
      ['        "volume": {subpath: another-folder}'],
    ].map((options) => ({ options }))
  )('refuses unsupported nested long-volume options %#', ({ options }) => {
    const source = fixture('/data/archive', options);
    const block = extractSidecarBlocks(source)[0];
    expect(() => extractVolumeMounts(block?.lines ?? [])).toThrow(
      /Unsupported Compose volume options/u
    );
  });
});

describe('declaration-driven writer discovery', () => {
  const config = 'dbs:\n  - path: /data/sqlite/food.db\n';
  function fixture(volume: string) {
    return [
      'services:',
      '  food-api:',
      '    build:',
      '      dockerfile: pillars/food/Dockerfile',
      '    volumes:',
      `      - ${volume}:/data/sqlite`,
      '    environment:',
      '      FOOD_SQLITE_PATH: /data/sqlite/food.db',
      '  food-worker:',
      '    build:',
      '      dockerfile: pillars/food/Dockerfile',
      '    volumes:',
      '      - ingest:/data/food/ingest',
      '  another-api:',
      '    build:',
      '      dockerfile: pillars/other/Dockerfile',
      '    volumes:',
      `      - ${volume}:/data/sqlite`,
      '    environment:',
      '      OTHER_SQLITE_PATH: /data/sqlite/other.db',
      '  food-litestream:',
      '    volumes:',
      `      - ${volume}:/data/sqlite`,
      '      - ./litestream/food.yml:/etc/litestream.yml:ro',
      '    environment:',
      '      FOOD_LITESTREAM_REPLICA_URL: ${FOOD_LITESTREAM_REPLICA_URL:-}',
    ].join('\n');
  }

  it.each(['sqlite-data', 'unconventional-records'])(
    'matches the owning file on declared %s and excludes REST-only and foreign workers',
    (volume) => {
      const source = fixture(volume);
      const paths = declaredDatabasePaths(config);
      const writers = extractWriterMounts('food', source, paths);
      expect(writers).toEqual([
        [{ source: volume, target: '/data/sqlite', readOnly: false, isBind: false }],
      ]);
      const sidecar = extractSidecarBlocks(source)[0];
      expect(checkSidecarWiring('food', sidecar?.lines ?? [], config, writers)).toEqual([]);
      const changed = (sidecar?.lines ?? []).map((line) =>
        line.replace(`${volume}:/data/sqlite`, 'wrong:/data/sqlite')
      );
      expect(checkSidecarWiring('food', changed, config, writers)).toContainEqual(
        expect.stringContaining(`expected ${volume}`)
      );
    }
  );

  it('keeps the second real SQLite writer and rejects changed file or mount identity', () => {
    const source = fixture('configured-records').replace(
      '      - ingest:/data/food/ingest',
      '      - configured-records:/data/sqlite\n    environment:\n      FOOD_SQLITE_PATH: /data/sqlite/food.db'
    );
    expect(extractWriterMounts('food', source, declaredDatabasePaths(config))).toHaveLength(2);
    expect(() =>
      extractWriterMounts(
        'food',
        source.replaceAll(
          'FOOD_SQLITE_PATH: /data/sqlite/food.db',
          'FOOD_SQLITE_PATH: /data/sqlite/other.db'
        ),
        declaredDatabasePaths(config)
      )
    ).toThrow(/database path does not match/u);
    const shadowed = source.replace(
      '      - configured-records:/data/sqlite',
      '      - configured-records:/data/sqlite\n      - wrong:/data/sqlite/food.db'
    );
    const sidecar = extractSidecarBlocks(shadowed)[0];
    expect(
      checkSidecarWiring(
        'food',
        sidecar?.lines ?? [],
        config,
        extractWriterMounts('food', shadowed, declaredDatabasePaths(config))
      ).length
    ).toBeGreaterThan(0);
  });
  it.each([
    "'pillars/food/Dockerfile'",
    '"pillars/food/Dockerfile"',
    'pillars/food/Dockerfile # worker',
    "'./pillars/food/Dockerfile' # worker",
  ])('validates the second owning writer with Dockerfile scalar %s', (declaration) => {
    const source = fixture('configured-records')
      .replace(
        '  food-worker:\n    build:\n      dockerfile: pillars/food/Dockerfile',
        `  food-worker:\n    build:\n      dockerfile: ${declaration}`
      )
      .replace(
        '      - ingest:/data/food/ingest',
        '      - configured-records:/data/sqlite\n    environment:\n      FOOD_SQLITE_PATH: /data/sqlite/food.db'
      );
    const paths = declaredDatabasePaths(config);
    expect(extractWriterMounts('food', source, paths)).toHaveLength(2);
    const mismatched = source.replace(
      '      FOOD_SQLITE_PATH: /data/sqlite/food.db\n  another-api:',
      '      FOOD_SQLITE_PATH: /data/sqlite/unbacked.db\n  another-api:'
    );
    expect(() => extractWriterMounts('food', mismatched, paths)).toThrow(
      /database path does not match/u
    );
  });

  it.each([
    '    build: {dockerfile: pillars/food/Dockerfile}',
    '    build: *food-build',
    '    "build":\n      dockerfile: pillars/food/Dockerfile',
    '    <<: *food-build',
    '    build:\n      dockerfile: >\n        pillars/food/Dockerfile',
    '    build:\n      "dockerfile": pillars/food/Dockerfile',
    '    build:\n      context: ..',
    '    build:\n      dockerfile: pillars/food/Dockerfile\n      dockerfile: pillars/other/Dockerfile',
  ])('refuses unsupported or ambiguous ownership instead of omitting a writer: %s', (build) => {
    const source = fixture('configured-records').replace(
      '    build:\n      dockerfile: pillars/food/Dockerfile',
      build
    );
    expect(() => extractWriterMounts('food', source, declaredDatabasePaths(config))).toThrow();
  });

  it('keeps an exact-file-only writer visible to the existing invalid mount check', () => {
    const source = fixture('configured-records').replace(
      '      - ingest:/data/food/ingest',
      '      - ./food.db:/data/sqlite/food.db'
    );
    const writers = extractWriterMounts('food', source, declaredDatabasePaths(config));
    expect(writers).toHaveLength(2);
    const sidecar = extractSidecarBlocks(source)[0];
    expect(checkSidecarWiring('food', sidecar?.lines ?? [], config, writers)).toContainEqual(
      expect.stringContaining('ambiguous or file-only database mount')
    );
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
        .map(
          (block) =>
            [
              block.id,
              checkSidecarWiring(
                block.id,
                block.lines,
                readFileSync(resolve(repoRoot, 'infra', 'litestream', `${block.id}.yml`), 'utf8'),
                extractWriterMounts(
                  block.id,
                  readFileSync(composePath, 'utf8'),
                  declaredDatabasePaths(
                    readFileSync(
                      resolve(repoRoot, 'infra', 'litestream', `${block.id}.yml`),
                      'utf8'
                    )
                  )
                )
              ),
            ] as const
        )
        .filter(([, violations]) => violations.length > 0)
    );
    expect(violationsById).toEqual({});
    const composeSource = readFileSync(composePath, 'utf8');
    expect(
      extractWriterMounts(
        'food',
        composeSource,
        declaredDatabasePaths(readFileSync(resolve(repoRoot, 'infra/litestream/food.yml'), 'utf8'))
      )
    ).toHaveLength(1);
    expect(
      extractWriterMounts(
        'cerebrum',
        composeSource,
        declaredDatabasePaths(
          readFileSync(resolve(repoRoot, 'infra/litestream/cerebrum.yml'), 'utf8')
        )
      )
    ).toHaveLength(2);
  });
});
