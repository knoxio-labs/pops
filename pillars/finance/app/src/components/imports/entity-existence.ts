/**
 * Whether the entity a button is about to assign already exists.
 *
 * `unknown` covers the window before the entity list has loaded: until it has,
 * a name missing from it is not proof the merchant is absent, and promising
 * "Create X" on that evidence would be a lie.
 */
export type EntityExistence = 'existing' | 'new' | 'unknown';

/** Scope of the button asking: one transaction, or the whole group. */
export type AcceptScope = 'one' | 'all';

/** An entity matches `name` when it IS that name, or is also known by it. */
export function entityAnswersTo(
  entity: { name: string; aliases?: readonly string[] },
  lowercaseName: string
): boolean {
  if (entity.name.toLowerCase() === lowercaseName) return true;
  return (entity.aliases ?? []).some((alias) => alias.toLowerCase() === lowercaseName);
}

/**
 * Classify `entityName` against the entities currently loaded. `entities` is
 * the complete contact set once loaded (see `useEntities`), so an absent name
 * is `new` rather than merely unseen.
 *
 * Aliases count as the entity's name. Without that, a suggestion of "Maccas"
 * against a McDonald's that lists it as an alias reads as `new`, and accepting
 * mints a second entity for a merchant already known.
 */
export function resolveEntityExistence(
  entityName: string | null | undefined,
  entities: ReadonlyArray<{ name: string; aliases?: readonly string[] }> | undefined
): EntityExistence {
  if (!entityName || !entities) return 'unknown';
  const target = entityName.toLowerCase();
  return entities.some((e) => entityAnswersTo(e, target)) ? 'existing' : 'new';
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
