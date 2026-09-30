import { Select } from '@pops/ui';

import type { CatalogueIssueSources, CatalogueType } from '../catalogue-editor/types';
import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { ArchiveTarget } from './cataloguePageTypes';

const NO_REPLACEMENT = '';

function replacementOptions(
  target: ArchiveTarget,
  types: readonly CatalogueType[]
): { readonly value: string; readonly label: string }[] {
  if (target.kind === 'type')
    return types
      .filter((type) => type.id !== target.id && type.archivedAt === null)
      .map((type) => ({ value: type.id, label: `${type.label} (${type.key})` }));
  const source = types
    .flatMap((type) => type.fields.map((field) => ({ field, type })))
    .find(({ field }) => field.id === target.id);
  if (source === undefined) return [];
  return source.type.fields
    .filter(
      (field) =>
        field.id !== source.field.id &&
        field.archivedAt === null &&
        field.kind === source.field.kind &&
        field.cardinality === source.field.cardinality
    )
    .map((field) => ({ value: field.id, label: `${field.label} (${field.key})` }));
}

function replacementIssue(
  target: ArchiveTarget,
  sources: CatalogueIssueSources
): InventoryApiIssue | undefined {
  const operationKind = target.kind === 'type' ? 'archive_type' : 'archive_field';
  return sources
    .filter(
      (source) =>
        source.operations?.some(
          (operation) => operation.kind === operationKind && operation.id === target.id
        ) ?? false
    )
    .flatMap((source) => source.issues)
    .find((issue) => issue.definitionId === target.id && issue.code.startsWith('replacement_'));
}

/** Offers live, compatible replacements and shows server lineage refusals beside the control. */
export function ArchiveReplacementControl({
  disabled,
  issueSources,
  onChange,
  target,
  types,
  value,
}: {
  readonly disabled: boolean;
  readonly issueSources: CatalogueIssueSources;
  readonly onChange: (value: string) => void;
  readonly target: ArchiveTarget;
  readonly types: readonly CatalogueType[];
  readonly value: string;
}) {
  const choices = replacementOptions(target, types);
  const refusal = replacementIssue(target, issueSources);
  return (
    <div className="space-y-1">
      <Select
        disabled={disabled}
        error={refusal?.message}
        label="Record replacement"
        onChange={(event) => onChange(event.currentTarget.value)}
        options={[{ value: NO_REPLACEMENT, label: 'No replacement' }, ...choices]}
        value={value}
      />
      {choices.length === 0 && (
        <p className="text-sm text-muted-foreground">No live replacement fits this definition.</p>
      )}
    </div>
  );
}
