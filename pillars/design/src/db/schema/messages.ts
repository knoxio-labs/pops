import { foreignKey, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { designThreads } from './threads.js';

/**
 * One message on a thread. The thread's opening comment is a message too, so
 * a thread is never a row with a body of its own — a reply from a session and
 * the original remark are the same kind of thing.
 */
export const designMessages = sqliteTable(
  'design_messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id').notNull(),
    author: text('author').notNull(),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.threadId],
      foreignColumns: [designThreads.id],
      name: 'fk_design_messages_thread',
    }).onDelete('cascade'),
    index('idx_design_messages_thread').on(table.threadId, table.createdAt),
  ]
);
