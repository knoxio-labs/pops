type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses a required positive integer from an MCP argument bag. */
export function requiredPositiveInteger(
  args: Record<string, unknown>,
  key: string
): Parsed<number> {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return { ok: false, error: `Missing or invalid required field: ${key}` };
  }
  return { ok: true, value };
}

/** Parses an optional positive integer, with an inclusive upper bound when supplied. */
export function optionalPositiveInteger(
  args: Record<string, unknown>,
  key: string,
  maximum?: number
): Parsed<number | undefined> {
  const value = args[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0 ||
    (maximum !== undefined && value > maximum)
  ) {
    return { ok: false, error: `Invalid field: ${key}` };
  }
  return { ok: true, value };
}

/** Parses a non-empty array whose members are JSON-style objects. */
export function requiredObjectArray(
  args: Record<string, unknown>,
  key: string
): Parsed<Record<string, unknown>[]> {
  const value = args[key];
  if (!Array.isArray(value) || value.length === 0 || !value.every(isRecord)) {
    return { ok: false, error: `Missing or invalid required field: ${key}` };
  }
  return { ok: true, value };
}

/** Parses an optional JSON-style object from an MCP argument bag. */
export function optionalObject(
  args: Record<string, unknown>,
  key: string
): Parsed<Record<string, unknown> | undefined> {
  const value = args[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (!isRecord(value)) return { ok: false, error: `Invalid field: ${key}` };
  return { ok: true, value };
}
