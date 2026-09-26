/** Public immutable shapes loaded from persisted catalogue snapshots. */
import type {
  FieldCardinality,
  FieldStorage,
  PrimitiveKind,
  PrimitiveWireValue,
  ValueFieldDefinition,
} from './value-codec.js';

/** One immutable catalogue revision available to read. */
export interface PersistedCatalogueRevision {
  readonly revision: number;
  readonly baseRevision: number | null;
  readonly status: 'draft' | 'published' | 'abandoned';
  readonly minimumProtocol: number;
}

/** One enum option from the exact catalogue revision that owns its field. */
export interface PersistedEnumOption {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
}

/** One full persisted field definition. */
export interface PersistedItemTypeField extends ValueFieldDefinition {
  readonly typeId: string;
  readonly label: string;
  readonly help: string | null;
  readonly sortOrder: number;
  readonly required: boolean;
  readonly expressionVersion: number | null;
  readonly expressionJson: string | null;
  readonly allowOverride: boolean;
  /** Canonical values clients pre-fill on item create; empty means none. Never applied by the server. */
  readonly defaultValues: readonly PrimitiveWireValue[];
  readonly presentation: Record<string, unknown>;
  readonly archivedAt: string | null;
  /** The field that took over this archived field's values, when authoring named one. */
  readonly replacedBy: string | null;
  readonly enumOptions: readonly PersistedEnumOption[];
  /** Reference type ids admitted by this field, including all their descendants. */
  readonly admittedReferenceTypeIds: ReadonlySet<string>;
}

/** One full persisted type definition, including its field and option rows. */
export interface PersistedItemType {
  readonly revision: number;
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly capabilities: readonly string[];
  readonly legacyLabels: readonly string[];
  readonly presentation: Record<string, unknown>;
  readonly archivedAt: string | null;
  /** The type that took over this archived type's items, when authoring named one. */
  readonly replacedBy: string | null;
  /** The type whose fields and capabilities this type inherits, when present. */
  readonly parentTypeId: string | null;
  readonly fields: readonly PersistedItemTypeField[];
  /** The type's own and inherited fields, ordered from the oldest ancestor to this type. */
  readonly effectiveFields: readonly PersistedItemTypeField[];
  /** The de-duplicated capabilities inherited from ancestors and declared by this type. */
  readonly effectiveCapabilities: readonly string[];
}

/** A persisted field before descendant reference ids are resolved. */
export type UnresolvedItemTypeField = Omit<PersistedItemTypeField, 'admittedReferenceTypeIds'>;

/** A persisted type before its own and inherited fields and capabilities are resolved. */
export type UnresolvedItemType = Omit<
  PersistedItemType,
  'fields' | 'effectiveFields' | 'effectiveCapabilities'
> & {
  readonly fields: readonly UnresolvedItemTypeField[];
};

/** A complete immutable catalogue descriptor loaded from SQLite. */
export interface PersistedCatalogue {
  readonly revision: PersistedCatalogueRevision;
  readonly types: readonly PersistedItemType[];
}

/** A stable type lookup key. Exactly one member must be supplied. */
export type PersistedTypeLookup =
  | { readonly id: string; readonly key?: never }
  | { readonly key: string; readonly id?: never };

/** Re-exports the persisted field vocabulary used by catalogue records. */
export type { FieldCardinality, FieldStorage, PrimitiveKind };
