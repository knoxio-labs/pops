/** Canonical refresh result; pending fields remain atomic and conflicting edits require a restart. */
export interface SourceRefresh<Source, Patch> {
  draft: Source;
  conflicts: (keyof Patch)[];
}

/** Source fields and optional failed action used to reconcile a canonical refresh. */
export interface SourceRefreshInput<Source, Patch> {
  canonical: Patch;
  draft: Source;
  initial: Source;
  failed?: Patch;
}

/** Reconcile untouched top-level source fields while preserving explicit pending values. */
export function refreshSource<Source extends object, Patch extends Partial<Source>>(
  { canonical: baseline, draft, initial, failed }: SourceRefreshInput<Source, Patch>,
  source: (value: Source) => Patch
): SourceRefresh<Source, Patch> {
  const canonical = source(initial);
  const retained = { ...source(draft) };
  const conflicts: (keyof Patch)[] = [];
  for (const key in retained) {
    const pending =
      Object.hasOwn(failed ?? {}, key) || !sameSourceValue(retained[key], baseline[key]);
    if (!pending) delete retained[key];
    else if (
      !sameSourceValue(canonical[key], baseline[key]) &&
      !sameSourceValue(canonical[key], retained[key])
    ) {
      conflicts.push(key);
    }
  }
  return { draft: { ...initial, ...retained }, conflicts };
}

/** Save reconciliation identifies observed or returned foreign fields that make whole-source inverses unsafe. */
export interface SavedSourceRefresh<Source, Patch> extends SourceRefresh<Source, Patch> {
  foreign: boolean;
  canonical: Patch;
}

/** Confirmed write and observations needed to preserve unrelated pending and foreign source fields. */
export interface SourceSaveInput<Source, Patch> {
  baseline: Source;
  canonical: Patch;
  draft: Source;
  result: Source;
  observed: Patch;
  pending: Patch;
}

/** Preserve unrelated drafts and observed foreign fields without acknowledging them as a saved result. */
export function refreshAfterSave<Source extends object, Patch extends Partial<Source>>(
  { baseline, canonical, draft, result, observed, pending }: SourceSaveInput<Source, Patch>,
  source: (value: Source) => Patch
): SavedSourceRefresh<Source, Patch> {
  const before = source(baseline);
  const confirmed = source(result);
  const inherited = untouchedSourceFields(before, canonical, pending);
  const incoming = untouchedSourceFields(canonical, observed, pending);
  const foreign = { ...inherited, ...incoming };
  const local = untouchedSourceFields(canonical, source(draft), pending);
  const returnedForeign = untouchedSourceFields(canonical, confirmed, pending);
  const conflicts = savedConflicts(canonical, confirmed, foreign, local);
  return {
    draft: { ...result, ...foreign, ...local },
    conflicts: [...new Set(conflicts)],
    canonical: { ...confirmed, ...foreign },
    foreign:
      !sameSourceValue(canonical, before) ||
      Object.keys(foreign).length > 0 ||
      Object.keys(returnedForeign).length > 0,
  };
}

function untouchedSourceFields<Patch extends object>(
  before: Patch,
  current: Patch,
  pending: Patch
): Partial<Patch> {
  const untouched: Partial<Patch> = { ...current };
  for (const key in untouched) {
    if (Object.hasOwn(pending, key) || sameSourceValue(untouched[key], before[key])) {
      delete untouched[key];
    }
  }
  return untouched;
}

function savedConflicts<Patch extends object>(
  before: Patch,
  confirmed: Patch,
  foreign: Partial<Patch>,
  local: Partial<Patch>
): (keyof Patch)[] {
  const conflicts: (keyof Patch)[] = [];
  for (const key in foreign) {
    if (!sameSourceValue(foreign[key], confirmed[key])) conflicts.push(key);
  }
  for (const key in local) {
    if (
      !sameSourceValue(confirmed[key], before[key]) &&
      !sameSourceValue(confirmed[key], local[key])
    )
      conflicts.push(key);
    if (Object.hasOwn(foreign, key) && !sameSourceValue(foreign[key], local[key]))
      conflicts.push(key);
  }
  return conflicts;
}

/** Replace only explicitly conflicted draft fields with corresponding observed canonical field facts. */
export function resetSourceConflicts<Source extends object, Patch extends Partial<Source>>(
  canonical: Patch,
  draft: Source,
  conflicts: readonly (keyof Patch)[]
): Source {
  const replacements = { ...canonical };
  for (const key in replacements) {
    if (!conflicts.includes(key)) delete replacements[key];
  }
  return { ...draft, ...replacements };
}

/** Compare JSON-shaped source values using their persisted serialization. */
export function sameSourceValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
