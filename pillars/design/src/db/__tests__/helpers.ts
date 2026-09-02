/**
 * A real, migrated database on a temp file per test.
 *
 * Not `:memory:` — the opener sets `journal_mode = WAL`, which an in-memory
 * database rejects, so a memory handle would exercise a configuration no
 * deployment ever runs.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDesignDb, type OpenedDesignDb } from '../open-design-db.js';

export interface TempDb extends OpenedDesignDb {
  path: string;
  cleanup: () => void;
}

export function openTempDesignDb(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), 'pops-design-db-'));
  const path = join(dir, 'design.db');
  const opened = openDesignDb(path);
  return {
    ...opened,
    path,
    cleanup: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
