import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * An unfinished play, mirrored from Plex.
 *
 * Deliberately NOT rows in `watch_history`. Plex reports `viewOffset` as
 * *current state* — only items still in progress carry the field at all, and it
 * clears once the title is finished — so a partial play is not an event in an
 * append-only log. Modelling it as one would mint a fresh row on every sync as
 * the offset advanced, and would silently change the meaning of every existing
 * `count(*)` over `watch_history`, most of which do not filter on `completed`.
 *
 * `progress` is stored rather than a boolean verdict: what counts as
 * "abandoned" is the consumer's call, and the live library spans 2% to 79%.
 */
export const watchProgress = sqliteTable(
  'watch_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaType: text('media_type', { enum: ['movie', 'episode'] }).notNull(),
    mediaId: integer('media_id').notNull(),
    /** Position reached, as a fraction of the runtime, in [0, 1]. */
    progress: real('progress').notNull(),
    viewOffsetMs: integer('view_offset_ms').notNull(),
    durationMs: integer('duration_ms'),
    observedAt: text('observed_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('idx_watch_progress_media').on(table.mediaType, table.mediaId)]
);
