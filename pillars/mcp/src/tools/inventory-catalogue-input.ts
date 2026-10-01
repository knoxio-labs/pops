/** MCP schema for the draft version a catalogue draft call was prepared against. */
export const expectedDraftVersionSchema = {
  type: 'integer',
  minimum: 1,
  description:
    'revision.draftVersion of the draft as last read (createDraft, readDraft or the previous patchDraft). A stale value is refused with inventory.catalogue.draft_conflict and changes nothing.',
};

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

/** MCP schema for opting into a full catalogue write response. */
export const catalogueIncludeSchema = {
  type: 'string',
  enum: ['catalogue'],
  description: 'Return the full catalogue body instead of the compact write summary',
};

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

/** Parses the exact draft, base and optimistic-concurrency revisions for a write. */
export function catalogueDraftTarget(
  args: Record<string, unknown>
): Parsed<{ revision: number; baseRevision: number; expectedDraftVersion: number }> {
  const revision = requiredPositiveInteger(args, 'revision');
  if (!revision.ok) return revision;
  const baseRevision = requiredPositiveInteger(args, 'baseRevision');
  if (!baseRevision.ok) return baseRevision;
  const expectedDraftVersion = requiredPositiveInteger(args, 'expectedDraftVersion');
  if (!expectedDraftVersion.ok) return expectedDraftVersion;
  return {
    ok: true,
    value: {
      revision: revision.value,
      baseRevision: baseRevision.value,
      expectedDraftVersion: expectedDraftVersion.value,
    },
  };
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

/** Parses an array whose members are JSON-style objects, at least `minLength` long. */
export function objectArray(
  args: Record<string, unknown>,
  key: string,
  minLength: number
): Parsed<Record<string, unknown>[]> {
  const value = args[key];
  if (!Array.isArray(value) || value.length < minLength || !value.every(isRecord)) {
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

/** Parses the optional full-catalogue response mode from MCP arguments. */
export function catalogueInclude(args: Record<string, unknown>): Parsed<boolean> {
  if (!('include' in args)) return { ok: true, value: false };
  if (args['include'] === 'catalogue') return { ok: true, value: true };
  return { ok: false, error: "Invalid field: include (expected 'catalogue')" };
}
