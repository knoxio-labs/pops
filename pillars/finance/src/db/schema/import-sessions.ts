import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The wizard's processing session, persisted so a restart mid-import costs a
 * reconnect rather than a reprocess (POPS-2449). Transient by design: every
 * row carries its own `expires_at`, re-armed on each write, and a sweep
 * deletes what has lapsed. `payload` is the whole progress object as JSON;
 * `status` is lifted out of it so a boot pass can find the sessions a restart
 * interrupted without parsing every payload.
 */
export const importSessions = sqliteTable(
  'import_sessions',
  {
    sessionId: text('session_id').primaryKey(),
    status: text('status', { enum: ['processing', 'completed', 'failed'] }).notNull(),
    payload: text('payload').notNull(),
    startedAt: text('started_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [index('idx_import_sessions_expires_at').on(table.expiresAt)]
);
