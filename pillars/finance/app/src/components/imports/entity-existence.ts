/**
 * Whether the entity a button is about to assign already exists.
 *
 * `unknown` is not a nicety: the entity list is one capped page, so a name
 * missing from it is not proof the merchant is absent. Promising "Create X"
 * on that evidence would be a lie whenever the list is truncated.
 */
export type EntityExistence = 'existing' | 'new' | 'unknown';

/** Scope of the button asking: one transaction, or the whole group. */
export type AcceptScope = 'one' | 'all';

/**
 * Classify `entityName` against the entities currently loaded.
 *
 * @param truncated Set when the list is an incomplete page of a larger set;
 *   an absent name then resolves to `unknown` rather than `new`.
 */
export function resolveEntityExistence(
  entityName: string | null | undefined,
  entities: ReadonlyArray<{ name: string }> | undefined,
  truncated = false
): EntityExistence {
  if (!entityName || !entities) return 'unknown';
  const target = entityName.toLowerCase();
  if (entities.some((e) => e.name.toLowerCase() === target)) return 'existing';
  return truncated ? 'unknown' : 'new';
}

const LABELS: Record<EntityExistence, Record<AcceptScope, (name: string) => string>> = {
  existing: {
    one: (name) => `Assign to "${name}"`,
    all: (name) => `Assign all to "${name}"`,
  },
  new: {
    one: (name) => `Create "${name}"`,
    all: (name) => `Create "${name}" & assign all`,
  },
  unknown: {
    one: (name) => `Accept "${name}"`,
    all: (name) => `Accept all as "${name}"`,
  },
};

/** The button label that says which of the two outcomes the click will have. */
export function acceptEntityLabel(
  existence: EntityExistence,
  scope: AcceptScope,
  entityName: string
): string {
  return LABELS[existence][scope](entityName);
}
