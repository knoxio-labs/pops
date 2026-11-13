import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { copyHistory, unchanged, type MigrationHistory } from './migration-history.js';
import { requireKitSuccess, requireZeroDiff, type BfmKitCompletion } from './migration-kit.js';

/** Normal introspection bytes after successful zero-diff verification against the owning schema. */
export interface VerifiedMigrationSnapshot {
  name: string;
  sourcePath: string;
  bytes: Buffer;
}

/** Only private fixture paths and the unchanged history are used to verify a baseline. */
export interface SnapshotVerificationOptions {
  history: MigrationHistory;
  pillarRoot: string;
  scratch: string;
  databasePath: string;
  runKit: (args: string[]) => BfmKitCompletion;
}

async function readPulledSnapshot(pulled: string): Promise<{ bytes: Buffer; sourcePath: string }> {
  const generated = (await readdir(join(pulled, 'meta'))).filter((name) =>
    name.endsWith('_snapshot.json')
  );
  const [snapshotName] = generated;
  if (generated.length !== 1 || snapshotName === undefined)
    throw new Error('Expected exactly one normal introspection snapshot.');
  const sourcePath = join(pulled, 'meta', snapshotName);
  const bytes = await readFile(sourcePath);
  const value = z
    .object({ dialect: z.literal('sqlite'), version: z.literal('6') })
    .passthrough()
    .parse(JSON.parse(bytes.toString('utf8')));
  if (value.dialect !== 'sqlite' || value.version !== '6')
    throw new Error('Unsupported pinned SQLite snapshot shape.');
  return { bytes, sourcePath };
}

/** Verify raw normal Kit output without editing its snapshot, SQL or journal. */
export async function verifyBfmSnapshot({
  history,
  pillarRoot,
  scratch,
  databasePath,
  runKit,
}: SnapshotVerificationOptions): Promise<VerifiedMigrationSnapshot> {
  const pulled = join(scratch, 'pull');
  await mkdir(pulled);
  requireKitSuccess(
    runKit(['pull', '--dialect=sqlite', `--url=${databasePath}`, `--out=${pulled}`])
  );
  const snapshot = await readPulledSnapshot(pulled);
  const check = join(scratch, 'verify');
  await copyHistory(history.files, check);
  const name = `${String(history.last).padStart(4, '0')}_snapshot.json`;
  await copyFile(snapshot.sourcePath, join(check, 'meta', name), constants.COPYFILE_EXCL);
  requireZeroDiff(
    runKit([
      'generate',
      '--dialect=sqlite',
      `--schema=${join(pillarRoot, 'src/db/schema.ts')}`,
      `--out=${check}`,
    ])
  );
  await unchanged(check, history.files);
  const afterFiles = await readdir(check);
  if (afterFiles.some((file) => file.endsWith('.sql') && !history.files.has(file))) {
    throw new Error('Owner schema differs from the historical migrated fixture.');
  }
  const afterMeta = await readdir(join(check, 'meta'));
  if (
    afterMeta.length !== 2 ||
    !(await readFile(join(check, 'meta', name))).equals(snapshot.bytes)
  ) {
    throw new Error('Normal zero-diff generation changed the adopted snapshot.');
  }
  return { ...snapshot, name };
}
