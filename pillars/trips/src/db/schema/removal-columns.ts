import { integer, text } from 'drizzle-orm/sqlite-core';

import type { HasDefault, NotNull } from 'drizzle-orm';
import type {
  SQLiteIntegerBuilderInitial,
  SQLiteTextBuilderInitial,
} from 'drizzle-orm/sqlite-core';

/** Retained removal identity and private write generation; Journey/Stay/Event metadata edits also advance removalRevision. */
export function removalColumns(): {
  removedAt: SQLiteTextBuilderInitial<'removed_at', [string, ...string[]], number | undefined>;
  removalOperationId: SQLiteTextBuilderInitial<
    'removal_operation_id',
    [string, ...string[]],
    number | undefined
  >;
  removalRevision: HasDefault<NotNull<SQLiteIntegerBuilderInitial<'removal_revision'>>>;
} {
  return {
    removedAt: text('removed_at'),
    removalOperationId: text('removal_operation_id'),
    removalRevision: integer('removal_revision').notNull().default(0),
  };
}
