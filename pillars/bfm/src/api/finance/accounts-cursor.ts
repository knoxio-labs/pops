import { z } from 'zod';

import { MobileAccountKindSchema } from '../../contract/account.js';

import type { MobileAccountsQuery } from '../../contract/account.js';

const AccountsCursorSchema = z.object({
  v: z.literal(2),
  offset: z.number().int().nonnegative(),
  search: z.string().nullable(),
  kind: MobileAccountKindSchema.nullable(),
  archived: z.enum(['true', 'false']).nullable(),
});

/** The next Finance offset and the filters that define the list. */
export type AccountsCursor = z.infer<typeof AccountsCursorSchema>;

/** Encode the next Finance offset and active filters as an opaque continuation token. */
export function encodeAccountsCursor(
  offset: number,
  query: Pick<MobileAccountsQuery, 'search' | 'kind' | 'archived'>
): string {
  return Buffer.from(
    JSON.stringify({
      v: 2,
      offset,
      search: query.search ?? null,
      kind: query.kind ?? null,
      archived: query.archived ?? null,
    }),
    'utf8'
  ).toString('base64url');
}

/** Decode a continuation token only when it belongs to the same filtered list. */
export function decodeAccountsCursor(
  encoded: string,
  query: Pick<MobileAccountsQuery, 'search' | 'kind' | 'archived'>
): AccountsCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const cursor = AccountsCursorSchema.safeParse(parsed);
  if (!cursor.success) return null;
  if (
    cursor.data.search !== (query.search ?? null) ||
    cursor.data.kind !== (query.kind ?? null) ||
    cursor.data.archived !== (query.archived ?? null)
  ) {
    return null;
  }
  return cursor.data;
}
