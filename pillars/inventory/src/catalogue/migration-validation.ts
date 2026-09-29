import { CatalogueApiError } from './authoring-types.js';
import { migrationValidationIssue as issue } from './migration-coverage-issues.js';

import type { items } from '../db/schema.js';
import type { CatalogueIssue } from './authoring-types.js';
import type { RequiredMigrationCoverage } from './migration-coverage.js';
import type { CatalogueMigration, CatalogueMigrationStep } from './migration-types.js';

/** Returns the destination field whose owning type receives a migration step. */
export function migrationStepTargetFieldId(step: CatalogueMigrationStep): string {
  if (step.kind === 'copy' || step.kind === 'convert_decimal') return step.toFieldId;
  if (step.kind === 'copy_legacy_value') return step.toFieldId;
  return step.fieldId;
}

function migrationStepSourceFieldId(step: CatalogueMigrationStep): string | undefined {
  return step.kind === 'copy' || step.kind === 'convert_decimal' ? step.fromFieldId : undefined;
}

function requiredStepFields(
  coverage: RequiredMigrationCoverage,
  rows: readonly (typeof items.$inferSelect)[]
): Set<string> {
  return new Set(
    coverage.affectedFieldIds.filter((fieldId) => {
      return rows.some(
        (row) =>
          row.typeId !== null &&
          (coverage.baseEffectiveFieldIds.get(row.typeId)?.has(fieldId) === true ||
            coverage.candidateEffectiveFieldIds.get(row.typeId)?.has(fieldId) === true)
      );
    })
  );
}

function stepSourceIssues(
  migration: CatalogueMigration,
  coverage: RequiredMigrationCoverage
): CatalogueIssue[] {
  const issues: CatalogueIssue[] = [];
  for (const step of migration.steps) {
    const sourceFieldId = migrationStepSourceFieldId(step);
    if (sourceFieldId === undefined) continue;
    const sourceTypeId = coverage.fieldTypeIds.get(sourceFieldId);
    const targetTypeId = coverage.fieldTypeIds.get(migrationStepTargetFieldId(step));
    if (sourceTypeId === undefined) {
      issues.push(
        issue(
          'migration.steps',
          'migration_step_unknown_source',
          `Unknown source field ${sourceFieldId}`
        )
      );
    } else if (
      targetTypeId !== undefined &&
      !coverage.selectedTypeIds.some((typeId) => {
        const baseFields = coverage.baseEffectiveFieldIds.get(typeId);
        const candidateFields = coverage.candidateEffectiveFieldIds.get(typeId);
        const sourceAvailable =
          Boolean(baseFields?.has(sourceFieldId)) || Boolean(candidateFields?.has(sourceFieldId));
        return sourceAvailable && Boolean(candidateFields?.has(migrationStepTargetFieldId(step)));
      })
    ) {
      issues.push(
        issue(
          'migration.steps',
          'migration_step_cross_type',
          `Cannot copy ${sourceFieldId} across item types`
        )
      );
    }
  }
  return issues;
}

/** Validates step coverage against live rows selected from server-derived types. */
export function validateMigrationSteps(
  migration: CatalogueMigration,
  coverage: RequiredMigrationCoverage,
  rows: readonly (typeof items.$inferSelect)[]
): void {
  const stepTargets = new Set(migration.steps.map(migrationStepTargetFieldId));
  const issues = stepSourceIssues(migration, coverage);
  for (const fieldId of requiredStepFields(coverage, rows)) {
    if (!stepTargets.has(fieldId)) {
      issues.push(issue('migration.steps', 'migration_step_missing', `No step covers ${fieldId}`));
    }
  }
  for (const fieldId of stepTargets) {
    if (!coverage.affectedFieldIds.includes(fieldId)) {
      issues.push(
        issue(
          'migration.steps',
          'migration_step_unrelated',
          `A step targets unchanged field ${fieldId}`
        )
      );
    }
  }
  if (issues.length > 0) {
    throw new CatalogueApiError(
      400,
      'migration_steps_incomplete',
      'Migration steps do not cover affected live item fields',
      { issues }
    );
  }
}
