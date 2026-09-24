import {
  classifyCatalogueCompatibility,
  loadPublishedCatalogue,
  replacingField,
  replacingType,
} from '../../catalogue/index.js';

import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from '../../catalogue/index.js';
import type {
  CatalogueChange,
  CatalogueChangeDefinition,
  CatalogueChangeKind,
} from './catalogue-change.js';
import type { CommandDb } from './entities.js';

interface Located {
  readonly definition: CatalogueChangeDefinition;
  readonly typeId: string | null;
  readonly fieldId: string | null;
}

function locateInType(type: PersistedItemType, id: string): Located | null {
  if (type.id === id) return { definition: 'type', typeId: type.id, fieldId: null };
  for (const field of type.fields) {
    if (field.id === id) return { definition: 'field', typeId: type.id, fieldId: field.id };
    if (field.enumOptions.some((option) => option.id === id)) {
      return { definition: 'option', typeId: type.id, fieldId: field.id };
    }
  }
  return null;
}

function locate(catalogues: readonly PersistedCatalogue[], id: string): Located {
  for (const type of catalogues.flatMap((catalogue) => catalogue.types)) {
    const located = locateInType(type, id);
    if (located !== null) return located;
  }
  return { definition: 'revision', typeId: null, fieldId: null };
}

function replacementId(
  active: PersistedCatalogue | undefined,
  located: Located,
  id: string
): string | null {
  if (active === undefined) return null;
  if (located.definition === 'type') return replacingType(active, id)?.id ?? null;
  if (located.definition === 'field') return replacingField(active, id)?.id ?? null;
  return null;
}

/**
 * A change about `id`, located in whichever of `catalogues` (the active one
 * first) still declares it. An archived type or field whose lineage in the
 * active catalogue ends at a live replacement is `replaced`, naming it.
 */
export function catalogueChange(
  catalogues: readonly PersistedCatalogue[],
  id: string,
  change: CatalogueChangeKind,
  revision: number
): CatalogueChange {
  const located = locate(catalogues, id);
  const replacement = change === 'archived' ? replacementId(catalogues[0], located, id) : null;
  return {
    ...located,
    id,
    change: replacement === null ? change : 'replaced',
    replacementId: replacement,
    revision,
  };
}

/** The whole revision is one this server cannot judge the change by. */
export function revisionUnavailable(revision: number): CatalogueChange {
  return {
    definition: 'revision',
    id: String(revision),
    typeId: null,
    fieldId: null,
    change: 'not_in_revision',
    replacementId: null,
    revision,
  };
}

/**
 * The first published revision after `authored`, up to `active`, in which
 * `holds` is true; `active`'s own number when none is (a revision in between
 * was abandoned, or the change only shows against the authored snapshot).
 */
export function firstRevisionWhere(
  db: CommandDb,
  authored: PersistedCatalogue,
  active: PersistedCatalogue,
  holds: (catalogue: PersistedCatalogue) => boolean
): number {
  for (let next = authored.revision.revision + 1; next < active.revision.revision; next += 1) {
    const catalogue = loadPublishedCatalogue(db, next);
    if (catalogue !== null && holds(catalogue)) return next;
  }
  return active.revision.revision;
}

/** The type `typeId` in `catalogue`, when it declares one. */
export function typeIn(
  catalogue: PersistedCatalogue,
  typeId: string
): PersistedItemType | undefined {
  return catalogue.types.find((type) => type.id === typeId);
}

/** The field `fieldId` in any type of `catalogue`, when it declares one. */
export function fieldIn(
  catalogue: PersistedCatalogue,
  fieldId: string
): PersistedItemTypeField | undefined {
  return catalogue.types.flatMap((type) => type.fields).find((field) => field.id === fieldId);
}

const UPDATE_CHANGE_KINDS: Readonly<Record<string, CatalogueChangeKind>> = {
  field_became_required: 'now_required',
  primitive_kind_added: 'needs_newer_app',
};

function updateChangeKind(
  code: string,
  id: string,
  active: PersistedCatalogue
): CatalogueChangeKind {
  if (code === 'non_optional_field_added') {
    const field = fieldIn(active, id);
    return field?.required === true && field.storage === 'stored' ? 'now_required' : 'redefined';
  }
  return UPDATE_CHANGE_KINDS[code] ?? 'redefined';
}

function pairwiseChanges(
  db: CommandDb,
  authored: PersistedCatalogue,
  active: PersistedCatalogue
): Map<string, number> {
  const firstSeen = new Map<string, number>();
  let previous = authored;
  for (let next = authored.revision.revision + 1; next <= active.revision.revision; next += 1) {
    const catalogue = loadPublishedCatalogue(db, next);
    if (catalogue === null) continue;
    for (const change of classifyCatalogueCompatibility(previous, catalogue).changes) {
      const key = `${change.definitionId}:${change.code}`;
      if (!firstSeen.has(key)) firstSeen.set(key, next);
    }
    previous = catalogue;
  }
  return firstSeen;
}

/**
 * Why `authored` cannot be rebased onto `active`: one change per incompatible
 * difference the direct comparison finds (the one the refusal is decided by),
 * each dated by the first published revision in between that introduced it.
 */
export function updateRequiredChanges(
  db: CommandDb,
  authored: PersistedCatalogue,
  active: PersistedCatalogue
): CatalogueChange[] {
  const incompatible = classifyCatalogueCompatibility(authored, active).changes.filter(
    (change) => change.code !== 'base_revision_mismatch' && change.classification !== 'compatible'
  );
  if (incompatible.length === 0) return [];
  const firstSeen = pairwiseChanges(db, authored, active);
  return incompatible.map((change) => {
    if (change.code === 'minimum_protocol_increased') {
      const floor = authored.revision.minimumProtocol;
      const revision = firstRevisionWhere(
        db,
        authored,
        active,
        (catalogue) => catalogue.revision.minimumProtocol > floor
      );
      return { ...revisionUnavailable(revision), change: 'needs_newer_app' };
    }
    const revision =
      firstSeen.get(`${change.definitionId}:${change.code}`) ?? active.revision.revision;
    const kind = updateChangeKind(change.code, change.definitionId, active);
    return catalogueChange([active, authored], change.definitionId, kind, revision);
  });
}
