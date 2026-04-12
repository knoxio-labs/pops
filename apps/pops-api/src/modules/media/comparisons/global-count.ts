import { getDb } from '../../../db.js';

export function getGlobalComparisonCount(): number {
  const rawDb = getDb();
  const row = rawDb.prepare(`SELECT COUNT(*) as cnt FROM comparisons`).get() as
    | { cnt: number }
    | undefined;
  return row?.cnt ?? 0;
}
