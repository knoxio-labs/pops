type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

/** One non-empty external identifier sent as part of an item-edit replacement. */
export interface ExternalIdInput {
  readonly kind: string;
  readonly value: string;
}

/** Validates and trims an optional sticker code; null explicitly clears it. */
export function parseCode(args: Record<string, unknown>): Parsed<string | null | undefined> {
  const code = args['code'];
  if (code === undefined || code === null) return { ok: true, value: code };
  if (typeof code !== 'string' || code.trim().length < 1 || code.trim().length > 64) {
    return { ok: false, error: 'code must be a string of 1–64 characters or null' };
  }
  return { ok: true, value: code.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Parses an optional replacement external-identifier list, preserving an empty list. */
export function parseExternalIds(
  args: Record<string, unknown>
): Parsed<readonly ExternalIdInput[] | undefined> {
  if (args['externalIds'] === undefined) return { ok: true, value: undefined };
  const externalIds = args['externalIds'];
  if (!Array.isArray(externalIds)) return { ok: false, error: 'externalIds must be an array' };

  const parsed: ExternalIdInput[] = [];
  for (const [index, entry] of externalIds.entries()) {
    const path = `externalIds[${String(index)}]`;
    if (!isRecord(entry)) return { ok: false, error: `${path} must be an object` };
    for (const key of Object.keys(entry)) {
      if (key !== 'kind' && key !== 'value') {
        return { ok: false, error: `${path}.${key} is not allowed` };
      }
    }
    const kind = entry['kind'];
    if (typeof kind !== 'string' || kind.length === 0) {
      return { ok: false, error: `${path}.kind must be a non-empty string` };
    }
    const value = entry['value'];
    if (typeof value !== 'string' || value.length === 0) {
      return { ok: false, error: `${path}.value must be a non-empty string` };
    }
    parsed.push({ kind, value });
  }
  return { ok: true, value: parsed };
}
