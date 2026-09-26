import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { CatalogueIssueSources, CatalogueOperation } from './types';

function sameOperation(left: CatalogueOperation, right: CatalogueOperation): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Matches an issue to an existing definition or to the operation that created a new definition. */
export function issueBelongsToDefinition(
  issue: InventoryApiIssue,
  definitionId: string | undefined,
  operation: CatalogueOperation | null,
  issueSources: CatalogueIssueSources
): boolean {
  if (issue.definitionId === null) return true;
  if (definitionId !== undefined) return issue.definitionId === definitionId;
  if (operation === null) return false;
  return issueSources.some(
    (source) =>
      source.issues.includes(issue) &&
      source.operations !== null &&
      source.operations.length === 1 &&
      source.operations[0] !== undefined &&
      sameOperation(source.operations[0], operation)
  );
}
