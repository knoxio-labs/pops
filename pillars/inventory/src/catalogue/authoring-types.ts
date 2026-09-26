import type { z } from 'zod';

import type { CatalogueMigrationStepSchema } from '../contract/rest-catalogue-migration-schemas.js';
import type { CatalogueDraftOperationSchema } from '../contract/rest-catalogue-schemas.js';
import type { PersistedItemTypeField } from './catalogue-types.js';
import type { CatalogueCompatibilityAssessment } from './compatibility-preview.js';
import type { PrimitiveWireValue } from './value-types.js';

export type DraftOperation = z.infer<typeof CatalogueDraftOperationSchema>;
export type MigrationStepInput = z.infer<typeof CatalogueMigrationStepSchema>;

/** Input contract for publishing a validated catalogue draft. */
export interface CataloguePublicationInput {
  readonly baseRevision: number;
  readonly expectedDraftVersion: number;
  readonly note: string | null;
  readonly minimumProtocol?: number;
  readonly migrationName?: string;
  readonly migration?: {
    readonly name: string;
    readonly fromRevision: number;
    readonly toRevision: number;
    readonly affectedTypeIds: readonly string[];
    readonly affectedFieldIds: readonly string[];
    readonly steps: readonly MigrationStepInput[];
  };
}

/** The two actors allowed to author a catalogue revision. */
export type CatalogueAuthor =
  | { readonly kind: 'web'; readonly id: string; readonly label: string }
  | { readonly kind: 'service'; readonly id: string; readonly label: string };

/** A structured catalogue definition failure returned to API clients. */
export interface CatalogueIssue {
  readonly definitionId: string | null;
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** Revision-bound compatibility evidence returned by a non-mutating catalogue preview. */
export interface CataloguePreviewDiagnostics {
  readonly baseRevision: number;
  readonly draftRevision: number;
  readonly compatibility: CatalogueCompatibilityAssessment;
}

/** An HTTP-shaped catalogue authoring failure. */
export class CatalogueApiError extends Error {
  /**
   * @param status HTTP status appropriate for the failure.
   * @param code Stable machine-readable reason.
   * @param issues Definition-level validation failures, when applicable.
   */
  constructor(
    readonly status: 400 | 401 | 404 | 409,
    readonly code: string,
    message: string,
    options: {
      readonly issues?: readonly CatalogueIssue[];
      readonly preview?: CataloguePreviewDiagnostics;
      readonly currentDraftVersion?: number;
    } = {}
  ) {
    super(message);
    this.name = 'CatalogueApiError';
    this.issues = options.issues ?? [];
    this.preview = options.preview;
    this.currentDraftVersion = options.currentDraftVersion;
  }

  readonly issues: readonly CatalogueIssue[];
  readonly preview: CataloguePreviewDiagnostics | undefined;
  /** The draft's persisted version when a caller's expected draft version lost a race. */
  readonly currentDraftVersion: number | undefined;
}

/** Wire-ready actor metadata from a revision row. */
export interface CatalogueActor {
  readonly kind: 'web' | 'service' | 'migration';
  readonly id: string | null;
  readonly label: string | null;
}

/** Wire-ready immutable catalogue revision metadata. */
export interface CatalogueRevisionWire {
  readonly revision: number;
  readonly baseRevision: number | null;
  readonly status: 'draft' | 'published' | 'abandoned';
  readonly minimumProtocol: number;
  /** Optimistic-concurrency token; advances on every successful draft mutation. */
  readonly draftVersion: number;
  readonly created: { readonly actor: CatalogueActor; readonly at: string };
  readonly published: {
    readonly actor: CatalogueActor;
    readonly at: string;
    readonly note: string | null;
  } | null;
  readonly abandoned: { readonly actor: CatalogueActor; readonly at: string } | null;
}

/** Complete JSON descriptor returned by the catalogue API. */
export interface CatalogueDescriptor {
  readonly revision: CatalogueRevisionWire;
  readonly types: CatalogueTypeWire[];
}

/** A complete type definition in the owner-facing catalogue descriptor. */
export interface CatalogueTypeWire {
  readonly revision: number;
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly parentTypeId: string | null;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly capabilities: string[];
  readonly legacyLabels: string[];
  readonly presentation: Record<string, unknown>;
  readonly archivedAt: string | null;
  /** The live type that takes this archived type's new items, once authoring named one. */
  readonly replacedBy: string | null;
  readonly fields: CatalogueFieldWire[];
}

/** A complete field definition in the owner-facing catalogue descriptor. */
export interface CatalogueFieldWire {
  readonly id: string;
  readonly typeId: string;
  readonly key: string;
  readonly label: string;
  readonly help: string | null;
  readonly sortOrder: number;
  readonly kind: PersistedItemTypeField['kind'];
  readonly cardinality: PersistedItemTypeField['cardinality'];
  readonly required: boolean;
  readonly storage: PersistedItemTypeField['storage'];
  readonly fixedUnit: string | null;
  readonly referenceKinds: ('item' | 'location')[];
  readonly referenceTypeIds: string[];
  readonly expressionVersion: number | null;
  readonly expression: unknown | null;
  readonly allowOverride: boolean;
  readonly defaultValues: PrimitiveWireValue[];
  readonly presentation: Record<string, unknown>;
  readonly archivedAt: string | null;
  /** The field that takes this archived field's new values, once authoring named one. */
  readonly replacedBy: string | null;
  readonly enumOptions: CatalogueOptionWire[];
}

/** An enum option in the owner-facing catalogue descriptor. */
export interface CatalogueOptionWire {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
}

/** A catalogue audit row projected for the owner API. */
export interface CatalogueAuditWire {
  readonly id: number;
  readonly revision: number;
  readonly kind: 'published' | 'abandoned';
  readonly actor: CatalogueActor;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
  readonly migrationName: string | null;
  readonly affectedItems: number;
  readonly serverTime: string;
}
