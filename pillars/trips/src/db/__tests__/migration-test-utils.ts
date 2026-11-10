import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';
import { z } from 'zod';

const migrations = fileURLToPath(new URL('../../../migrations/', import.meta.url));
/** Materialize the actual committed migration prefix before a named migration for upgrade tests. */
export function migrationsBefore(directory: string, suffix: string): string {
  const journal = z
    .object({
      version: z.string(),
      dialect: z.string(),
      entries: z.array(
        z.object({
          idx: z.number(),
          version: z.string(),
          when: z.number(),
          tag: z.string(),
          breakpoints: z.boolean(),
        })
      ),
    })
    .parse(JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')));
  const index = journal.entries.findIndex((entry) => entry.tag.endsWith(suffix));
  expect(index).toBeGreaterThan(0);
  const previous = join(directory, 'migrations');
  mkdirSync(join(previous, 'meta'), { recursive: true });
  const entries = journal.entries.slice(0, index);
  for (const entry of entries)
    copyFileSync(join(migrations, `${entry.tag}.sql`), join(previous, `${entry.tag}.sql`));
  writeFileSync(join(previous, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  return previous;
}
