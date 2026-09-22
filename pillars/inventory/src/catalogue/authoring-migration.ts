import { CatalogueApiError } from './authoring-types.js';

import type { MigrationStepInput } from './authoring-types.js';
import type { CatalogueMigration } from './migrations.js';
import type { PrimitiveWireValue } from './value-codec.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toObjectPrimitive(value: Record<string, unknown>): PrimitiveWireValue | null {
  const entries = Object.entries(value);
  if (entries.length === 1 && typeof value.optionId === 'string')
    return { optionId: value.optionId };
  if (entries.length === 2 && typeof value.amount === 'string' && typeof value.unit === 'string') {
    return { amount: value.amount, unit: value.unit };
  }
  if (
    entries.length === 2 &&
    (value.targetKind === 'item' || value.targetKind === 'location') &&
    typeof value.targetId === 'string'
  ) {
    return { targetKind: value.targetKind, targetId: value.targetId };
  }
  return null;
}

function toPrimitive(value: unknown): PrimitiveWireValue | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  return isRecord(value) ? toObjectPrimitive(value) : null;
}

function migrationStep(step: MigrationStepInput): CatalogueMigration['steps'][number] {
  if (step.kind !== 'set_default') return step;
  const values = step.values.map(toPrimitive);
  if (values.some((value) => value === null)) {
    throw new CatalogueApiError(
      400,
      'invalid_migration',
      'Migration contains a value outside the closed primitive vocabulary'
    );
  }
  return { ...step, values: values.filter((value): value is PrimitiveWireValue => value !== null) };
}

/** Validates and narrows the optional migration body used by publication. */
export function migrationInput(
  input: {
    readonly migration?: {
      readonly name: string;
      readonly fromRevision: number;
      readonly toRevision: number;
      readonly affectedTypeIds: readonly string[];
      readonly affectedFieldIds: readonly string[];
      readonly steps: readonly MigrationStepInput[];
    };
    readonly migrationName?: string;
  },
  fromRevision: number,
  toRevision: number
): CatalogueMigration | undefined {
  if (input.migration === undefined) return undefined;
  if (input.migrationName !== undefined && input.migrationName !== input.migration.name) {
    throw new CatalogueApiError(
      400,
      'migration_name_mismatch',
      'migrationName must match migration.name'
    );
  }
  if (input.migration.fromRevision !== fromRevision || input.migration.toRevision !== toRevision) {
    throw new CatalogueApiError(
      400,
      'migration_revision_mismatch',
      'Migration revisions must match the draft transition'
    );
  }
  return { ...input.migration, steps: input.migration.steps.map(migrationStep) };
}
