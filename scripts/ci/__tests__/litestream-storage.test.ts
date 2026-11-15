import { describe, expect, it } from 'vitest';

import {
  databaseMountViolations,
  databaseReplicaViolations,
  declaredDatabasePaths,
  isStoragePath,
} from '../litestream-storage.mjs';

const database = '/data/archive/receipts.db';
const data = { source: 'pops-archive-data', target: '/data/archive', readOnly: false };

describe('declared Litestream database storage', () => {
  it.each([0, 31, 127])(
    'refuses control character %i without restricting Unicode filenames',
    (code) => {
      expect(isStoragePath(`/data/archive/file${String.fromCharCode(code)}.db`)).toBe(false);
    }
  );

  it('preserves ordinary Unicode filename characters', () => {
    expect(isStoragePath('/data/archive/arquivo-🗂.db')).toBe(true);
  });

  it('reads each owning declaration, including quoted paths and path after other entry fields', () => {
    expect(
      declaredDatabasePaths(
        [
          'dbs:',
          '  - path: "/data/archive/one.db"',
          '    replicas:',
          '      - path: /not-a-database',
          '  - name: second',
          "    path: '/data/archive/two.db' # configured",
          '',
        ].join('\n')
      )
    ).toEqual(['/data/archive/one.db', '/data/archive/two.db']);
  });

  it.each([
    '',
    'dbs: []',
    'dbs:\n  - replicas: []',
    'dbs:\n  - path: /data/archive/one.db\n  - replicas: []',
    'dbs:\n  - path: /data/archive/one.db\n    path: /data/archive/two.db',
    'dbs:\n  - path: /data/archive/one.db\ndbs:\n  - path: /data/archive/two.db',
    'dbs:\n\t- path: /data/archive/one.db',
  ])('refuses missing, duplicate and unsupported declarations: %s', (source) => {
    expect(() => declaredDatabasePaths(source)).toThrow();
  });

  it.each([
    'relative.db',
    '/data/archive/../other.db',
    '/data//one.db',
    '/data/./one.db',
    '/data/archive/',
    '/data',
    '/etc/one.db',
    '${DATA}/one.db',
    '/data/one\\two.db',
  ])('refuses unsafe or nonabsolute database path %s', (path) => {
    expect(() => declaredDatabasePaths(`dbs:\n  - path: ${path}\n`)).toThrow();
  });

  it('accepts configured DATA roots without imposing /data/sqlite', () => {
    expect(databaseMountViolations('archive', [database], [data], true)).toEqual([]);
    expect(
      databaseMountViolations('archive', [database], [{ ...data, readOnly: false }], false)
    ).toEqual([]);
  });

  it.each(
    [
      [],
      [{ ...data, target: '/data/archive-neighbor' }],
      [{ ...data, source: '' }],
      [{ ...data, readOnly: true }],
      [{ ...data, isBind: true }],
      [{ ...data, target: '/data/archive/../archive' }],
      [{ ...data, target: database }],
      [data, data],
      [data, { source: 'pops-other-data', target: '/data/archive/receipts.db', readOnly: true }],
      [data, { source: './host', target: '/data/archive/receipts.db', readOnly: true }],
    ].map((mounts) => ({ mounts }))
  )('refuses missing/wrong/ambiguous/shadowing mounts %#', ({ mounts }) => {
    expect(databaseMountViolations('archive', [database], mounts, true).length).toBeGreaterThan(0);
  });

  it('requires every DB and never treats an independent guard as DATA', () => {
    const guard = {
      source: 'pops-archive-upload-guard',
      target: '/data/archive-upload-guard',
      readOnly: true,
    };
    expect(
      databaseMountViolations('archive', [database], [data, guard], true).length
    ).toBeGreaterThan(0);
    expect(
      databaseMountViolations('archive', [database, '/data/elsewhere/two.db'], [data], true).length
    ).toBeGreaterThan(0);
    expect(databaseMountViolations('archive', [], [data], true).length).toBeGreaterThan(0);
  });
  it('compares the actual file within the volume, not independent container-path coverage', () => {
    const path = '/data/archive/nested/receipts.db';
    const writer = [{ ...data, readOnly: false }];
    const wrongReader = [{ ...data, target: '/data/archive/nested' }];
    expect(databaseMountViolations('archive', [path], writer, false)).toEqual([]);
    expect(databaseMountViolations('archive', [path], wrongReader, true)).toEqual([]);
    expect(databaseReplicaViolations('archive', [path], wrongReader, [writer])).toContainEqual(
      expect.stringContaining('different volume-relative database paths')
    );
    expect(databaseReplicaViolations('archive', [path], [data], [writer])).toEqual([]);
  });

  it('requires a writer and validates every writer, including nested shadows and target offsets', () => {
    expect(databaseReplicaViolations('archive', [database], [data], [])).toEqual([
      'missing an owning DATA writer',
    ]);
    const writer = [{ ...data, readOnly: false }];
    const wrongWriter = [{ ...data, target: '/data/archive/nested', readOnly: false }];
    expect(
      databaseReplicaViolations(
        'archive',
        ['/data/archive/nested/receipts.db'],
        [data],
        [writer, wrongWriter]
      ).length
    ).toBeGreaterThan(0);
    expect(
      databaseReplicaViolations(
        'archive',
        [database],
        [data],
        [[...writer, { source: 'other', target: database, readOnly: false }]]
      ).length
    ).toBeGreaterThan(0);
  });

  it.each(['sqlite-data', 'declared-private-records'])(
    'uses declared volume %s without inferring its name from the owner',
    (source) => {
      const reader = [{ ...data, source }];
      const writer = [{ ...data, source, readOnly: false }];
      expect(databaseReplicaViolations('archive', [database], reader, [writer])).toEqual([]);
      expect(
        databaseReplicaViolations('other', ['/data/archive/other.db'], reader, [writer])
      ).toEqual([]);
      expect(
        databaseReplicaViolations(
          'archive',
          [database],
          [{ ...data, source: 'different' }],
          [writer]
        )
      ).toContainEqual(expect.stringContaining(`expected ${source}`));
    }
  );

  it('rejects read-only shadow-WAL storage and a DATA volume reused as independent authority', () => {
    const writer = [{ ...data, readOnly: false }];
    expect(
      databaseReplicaViolations('archive', [database], [{ ...data, readOnly: true }], [writer])
        .length
    ).toBeGreaterThan(0);
    expect(
      databaseMountViolations(
        'archive',
        [database],
        [...writer, { ...data, target: '/data/archive-upload-guard', readOnly: false }],
        false
      )
    ).toContain('database DATA volume also mounts unrelated storage');
  });
});
