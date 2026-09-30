/** The one `LIKE` predicate every search adapter narrows a column with. */
import { like, sql } from 'drizzle-orm';

import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/** Trim search input the same way for matching and continuation identity. */
export function normalizeSearchText(text: string): string {
  return text.trim();
}

export function containsInsensitive(column: AnySQLiteColumn, text: string): SQL {
  return like(sql`lower(${column})`, `%${text.toLowerCase()}%`);
}

/** Match literal search text without treating SQL wildcard characters specially. */
export function containsLiteralInsensitive(value: SQLWrapper, text: string): SQL {
  return sql`instr(lower(${value}), ${text.toLowerCase()}) > 0`;
}
