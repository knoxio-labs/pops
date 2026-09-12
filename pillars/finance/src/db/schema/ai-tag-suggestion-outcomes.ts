import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { transactions } from './transactions.js';

export const aiTagSuggestionOutcomes = sqliteTable(
  'ai_tag_suggestion_outcomes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    /** The `PROMPT_VERSION_*` of the call that produced the suggestion, joinable to ai-telemetry. */
    promptVersion: text('prompt_version').notNull(),
    /** JSON array of the `source: 'ai'` tags offered for the row. */
    suggestedTags: text('suggested_tags').notNull(),
    /** JSON array of the tags the row was committed with. */
    committedTags: text('committed_tags').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('idx_ai_tag_suggestion_outcomes_prompt_version').on(table.promptVersion),
    index('idx_ai_tag_suggestion_outcomes_transaction').on(table.transactionId),
  ]
);
