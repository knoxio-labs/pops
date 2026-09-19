import { invalidCursor } from './errors.js';

import type { z } from 'zod';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Encode a cursor as base64url JSON. Opaque to clients, which echo it back
 * unmodified; the shape is this server's business and may change freely.
 */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Decode a cursor issued by {@link encodeCursor} and check it against
 * `schema`. Anything else (not base64url, not JSON, another route's cursor)
 * is `400 invalid_cursor`.
 */
export function decodeCursor<T>(schema: z.ZodType<T>, raw: string): T {
  if (!BASE64URL.test(raw)) throw invalidCursor();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) throw invalidCursor();
  return parsed.data;
}
