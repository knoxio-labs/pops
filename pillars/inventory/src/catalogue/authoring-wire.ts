import { desc, eq, lt } from 'drizzle-orm';

import { catalogueEvents, catalogueRevisions } from '../db/schema.js';

import type { CommandDb } from '../domain/commands/index.js';
import type {
  CatalogueActor,
  CatalogueAuditWire,
  CatalogueDescriptor,
  CatalogueFieldWire,
  CatalogueOptionWire,
  CatalogueRevisionWire,
  CatalogueTypeWire,
} from './authoring-types.js';
import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';

interface RevisionRow {
  readonly revision: number;
  readonly baseRevision: number | null;
  readonly status: 'draft' | 'published' | 'abandoned';
  readonly minimumProtocol: number;
  readonly createdActorKind: string;
  readonly createdActorId: string | null;
  readonly createdActorLabel: string | null;
  readonly createdAt: string;
  readonly publishedActorKind: string | null;
  readonly publishedActorId: string | null;
  readonly publishedActorLabel: string | null;
  readonly publishedAt: string | null;
  readonly publicationNote: string | null;
  readonly abandonedActorKind: string | null;
  readonly abandonedActorId: string | null;
  readonly abandonedActorLabel: string | null;
  readonly abandonedAt: string | null;
  readonly draftVersion: number;
}

function actor(kind: string | null, id: string | null, label: string | null): CatalogueActor {
  if (kind !== 'web' && kind !== 'service' && kind !== 'migration') {
    throw new Error(`unsupported catalogue actor kind '${kind ?? 'null'}'`);
  }
  return { kind, id, label };
}

function revisionRow(db: CommandDb, revision: number): RevisionRow | null {
  return (
    db.select().from(catalogueRevisions).where(eq(catalogueRevisions.revision, revision)).get() ??
    null
  );
}

function expressionValue(expressionJson: string | null): unknown | null {
  return expressionJson === null ? null : JSON.parse(expressionJson);
}

function revisionWire(row: RevisionRow): CatalogueRevisionWire {
  return {
    revision: row.revision,
    baseRevision: row.baseRevision,
    status: row.status,
    minimumProtocol: row.minimumProtocol,
    draftVersion: row.draftVersion,
    created: {
      actor: actor(row.createdActorKind, row.createdActorId, row.createdActorLabel),
      at: row.createdAt,
    },
    published:
      row.publishedAt === null
        ? null
        : {
            actor: actor(row.publishedActorKind, row.publishedActorId, row.publishedActorLabel),
            at: row.publishedAt,
            note: row.publicationNote,
          },
    abandoned:
      row.abandonedAt === null
        ? null
        : {
            actor: actor(row.abandonedActorKind, row.abandonedActorId, row.abandonedActorLabel),
            at: row.abandonedAt,
          },
  };
}

function optionWire(option: CatalogueOptionWire): CatalogueOptionWire {
  return { ...option };
}

function fieldWire(field: PersistedItemTypeField): CatalogueFieldWire {
  return {
    id: field.id,
    typeId: field.typeId,
    key: field.key,
    label: field.label,
    help: field.help,
    sortOrder: field.sortOrder,
    kind: field.kind,
    cardinality: field.cardinality,
    required: field.required,
    storage: field.storage,
    fixedUnit: field.fixedUnit,
    referenceKinds: [...field.referenceKinds],
    referenceTypeIds: [...field.referenceTypeIds],
    expressionVersion: field.expressionVersion,
    expression: expressionValue(field.expressionJson),
    allowOverride: field.allowOverride,
    presentation: { ...field.presentation },
    archivedAt: field.archivedAt,
    replacedBy: field.replacedBy,
    enumOptions: field.enumOptions.map((option) => optionWire(option)),
  };
}

function typeWire(type: PersistedItemType): CatalogueTypeWire {
  return {
    revision: type.revision,
    id: type.id,
    key: type.key,
    label: type.label,
    description: type.description,
    sortOrder: type.sortOrder,
    capabilities: [...type.capabilities],
    legacyLabels: [...type.legacyLabels],
    presentation: { ...type.presentation },
    archivedAt: type.archivedAt,
    replacedBy: type.replacedBy,
    fields: type.fields.map(fieldWire),
  };
}

/** Projects a persisted snapshot into the stable owner-facing JSON shape. */
export function toCatalogueDescriptor(
  db: CommandDb,
  catalogue: PersistedCatalogue
): CatalogueDescriptor {
  const row = revisionRow(db, catalogue.revision.revision);
  if (row === null)
    throw new Error(`catalogue revision ${catalogue.revision.revision} disappeared`);
  return { revision: revisionWire(row), types: catalogue.types.map(typeWire) };
}

/** Reads publication and abandonment audit records newest first. */
export function readCatalogueAudit(
  db: CommandDb,
  before: number | undefined,
  limit: number
): { events: CatalogueAuditWire[]; nextBefore: number | null } {
  const rows =
    before === undefined
      ? db
          .select()
          .from(catalogueEvents)
          .orderBy(desc(catalogueEvents.id))
          .limit(limit + 1)
          .all()
      : db
          .select()
          .from(catalogueEvents)
          .where(lt(catalogueEvents.id, before))
          .orderBy(desc(catalogueEvents.id))
          .limit(limit + 1)
          .all();
  const page = rows.slice(0, limit);
  return {
    events: page.map((row) => ({
      id: row.id,
      revision: row.revision,
      kind:
        row.kind === 'published' || row.kind === 'abandoned'
          ? row.kind
          : (() => {
              throw new Error(`unsupported catalogue event kind '${row.kind}'`);
            })(),
      actor: actor(row.actorKind, row.actorId, row.actorLabel),
      before: JSON.parse(row.beforeJson) as Record<string, unknown>,
      after: JSON.parse(row.afterJson) as Record<string, unknown>,
      migrationName: row.migrationName,
      affectedItems: row.affectedItems,
      serverTime: row.serverTime,
    })),
    nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}
