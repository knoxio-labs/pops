import type { CatalogueIssue } from './authoring-types.js';

/** Creates a structured issue for migration manifest and step validation. */
export function migrationValidationIssue(
  path: string,
  code: string,
  message: string
): CatalogueIssue {
  return { definitionId: null, path, code, message };
}

/** Compares a declared migration id list with the server-derived list. */
export function compareMigrationCoverage(
  path: 'affectedTypeIds' | 'affectedFieldIds',
  declared: readonly string[],
  required: readonly string[]
): CatalogueIssue[] {
  const declaredSet = new Set(declared);
  const requiredSet = new Set(required);
  const issues: CatalogueIssue[] = [];
  if (declaredSet.size !== declared.length) {
    issues.push(
      migrationValidationIssue(path, 'duplicate_definition', `${path} contains duplicate ids`)
    );
  }
  for (const id of requiredSet) {
    if (!declaredSet.has(id)) {
      issues.push(
        migrationValidationIssue(path, 'affected_definition_missing', `${path} omits ${id}`)
      );
    }
  }
  for (const id of declaredSet) {
    if (!requiredSet.has(id)) {
      issues.push(
        migrationValidationIssue(path, 'affected_definition_unrelated', `${path} includes ${id}`)
      );
    }
  }
  return issues;
}
