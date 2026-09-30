import { z } from 'zod';

import { MobileAccountKindSchema } from '../../contract/account.js';

import type { MobileAccountsQuery } from '../../contract/account.js';

const AccountsCursorSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  search: z.string().nullable(),
  kind: MobileAccountKindSchema.nullable(),
  archived: z.enum(['true', 'false']).nullable(),
});

/** The last account served and the filters that define its list. */
export type AccountsCursor = z.infer<typeof AccountsCursorSchema>;

/** Encode an account id and its active filters as an opaque continuation token. */
export function encodeAccountsCursor(
  id: string,
  query: Pick<MobileAccountsQuery, 'search' | 'kind' | 'archived'>
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      id,
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
