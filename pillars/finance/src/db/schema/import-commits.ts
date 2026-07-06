import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * One row per completed `commitImport` call that supplied a `commitKey`
 * (issues #3640/#3642). `commitKey` is the primary key — a client-generated
 * UUID scoped to a single "Approve & Commit All" click — so re-submitting
 * the exact same commit (a double-click, a retried request after a timeout)
 * is detected as a replay instead of re-applying every ChangeSet/transaction
 * a second time. `result` is the JSON-serialized `CommitResult` returned the
 * first time, replayed verbatim on every subsequent call with the same key.
 */
export const importCommits = sqliteTable('import_commits', {
  commitKey: text('commit_key').primaryKey(),
  result: text('result').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
