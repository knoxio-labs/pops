/**
 * The response helpers and untrusted-input readers every route here shares.
 */
import type { Request, Response } from 'express';

/** Error envelope. One field, because the overlay only ever shows the text. */
export function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

/**
 * A non-empty string from an untrusted body field, or `undefined`.
 *
 * Trimmed before the emptiness check so a body of spaces is rejected the same
 * as an absent one — otherwise a comment could be a blank bubble nobody can
 * read or act on.
 */
export function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The parsed JSON body as an object, `{}` for anything else. */
export function body(req: Request): Record<string, unknown> {
  const parsed: unknown = req.body;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/** A single query-string value, or `undefined` for absent and repeated ones. */
export function query(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}
