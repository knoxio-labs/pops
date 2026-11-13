import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

/** Immutable migration inputs and the last existing journal index. */
export interface MigrationHistory {
  files: ReadonlyMap<string, Buffer>;
  last: number;
}

/** Read the complete ordered historical SQL/journal bytes without changing them. */
export async function history(folder: string): Promise<MigrationHistory> {
  const journalBytes = await readFile(join(folder, 'meta/_journal.json'));
  const journal = z
    .object({
      version: z.literal('7'),
      dialect: z.literal('sqlite'),
      entries: z
        .array(
          z
            .object({
              idx: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
              version: z.literal('6'),
              when: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
              tag: z.string(),
              breakpoints: z.boolean(),
            })
            .strict()
        )
        .min(1),
    })
    .strict()
    .parse(JSON.parse(journalBytes.toString('utf8')));
  if (
    journal.dialect !== 'sqlite' ||
    !Array.isArray(journal.entries) ||
    journal.entries.length === 0
  ) {
    throw new Error('Expected an existing SQLite migration journal.');
  }
  const files = new Map([['meta/_journal.json', journalBytes]]);
  for (const [index, entry] of journal.entries.entries()) {
    if (
      entry.idx !== index ||
      typeof entry.tag !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/u.test(entry.tag)
    ) {
      throw new Error('Unsupported migration journal ordering or path.');
    }
    const path = `${entry.tag}.sql`;
    files.set(path, await readFile(join(folder, path)));
  }
  return { files, last: journal.entries.length - 1 };
}
/** Copy historical bytes exclusively into a new private fixture directory. */
export async function copyHistory(
  files: ReadonlyMap<string, Buffer>,
  destination: string
): Promise<void> {
  await mkdir(join(destination, 'meta'), { recursive: true });
  for (const [path, bytes] of files) {
    await writeFile(join(destination, path), bytes, { flag: 'wx' });
  }
}
/** Refuse any changed historical migration or journal byte. */
export async function unchanged(folder: string, files: ReadonlyMap<string, Buffer>): Promise<void> {
  for (const [path, bytes] of files) {
    if (!(await readFile(join(folder, path))).equals(bytes))
      throw new Error('Historical migration bytes changed.');
  }
}
