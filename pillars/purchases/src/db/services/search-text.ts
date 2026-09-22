/** The one `LIKE` predicate every search adapter narrows a column with. */
import { like, sql } from 'drizzle-orm';

import type { SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export function containsInsensitive(column: AnySQLiteColumn, text: string): SQL {
  return like(sql`lower(${column})`, `%${text.toLowerCase()}%`);
}
