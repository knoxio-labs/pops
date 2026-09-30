/** The one `LIKE` predicate every search adapter narrows a column with. */
import { like, sql } from 'drizzle-orm';

import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export function containsInsensitive(column: AnySQLiteColumn, text: string): SQL {
  return like(sql`lower(${column})`, `%${text.toLowerCase()}%`);
}

/** Match literal search text without treating SQL wildcard characters specially. */
export function containsLiteralInsensitive(value: SQLWrapper, text: string): SQL {
  return sql`instr(lower(${value}), ${text.toLowerCase()}) > 0`;
}
