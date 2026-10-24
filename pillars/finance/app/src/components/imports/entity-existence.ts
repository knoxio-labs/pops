/**
 * Whether the entity a button is about to assign already exists.
 *
 * `unknown` covers the window before the entity list has loaded: until it has,
 * a name missing from it is not proof the merchant is absent, and promising
 * "Create X" on that evidence would be a lie.
 */
export type EntityExistence = 'existing' | 'new' | 'checking' | 'unavailable';

/** Whether the complete contact list can verify an AI suggestion. */
export type EntityVerification = 'ready' | 'checking' | 'unavailable';

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

function merchantMatches<T extends { name: string; type?: string; aliases?: readonly string[] }>(
  entities: readonly T[],
  target: string
): T[] {
  const merchants = entities.filter((entity) => entity.type !== 'person');
  const named = merchants.filter((entity) => entity.name.toLowerCase() === target);
  return named.length > 0 ? named : merchants.filter((entity) => entityAnswersTo(entity, target));
}

/** Resolve an AI merchant suggestion only within non-person identities; reject ambiguity. */
export function resolveSuggestedMerchant<
  T extends { id: string; name: string; type: string; aliases?: readonly string[] },
>(entities: readonly T[], name: string): T | undefined {
  const target = name.toLowerCase();
  const matching = merchantMatches(entities, target);
  if (new Set(matching.map((entity) => entity.id)).size > 1) {
    throw new Error('Multiple contacts match this merchant name; select an entity explicitly');
  }
  return matching[0];
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
  entities: ReadonlyArray<{ name: string; type?: string; aliases?: readonly string[] }> | undefined,
  verification: EntityVerification
): EntityExistence {
  if (!entityName) return 'unavailable';
  if (verification === 'checking' || verification === 'unavailable') return verification;
  if (!entities) return 'unavailable';
  const target = entityName.toLowerCase();
  const matching = merchantMatches(entities, target);
  if (matching.length > 1) return 'unavailable';
  return matching.length === 1 ? 'existing' : 'new';
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
  checking: {
    one: (name) => `Checking "${name}"…`,
    all: (name) => `Checking "${name}"…`,
  },
  unavailable: {
    one: (name) => `Can't verify "${name}"`,
    all: (name) => `Can't verify "${name}"`,
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
