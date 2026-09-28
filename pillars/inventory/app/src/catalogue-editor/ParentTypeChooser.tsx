import { Alert, AlertDescription, AlertTitle, ComboboxSelect, Label } from '@pops/ui';

import {
  descendantIds,
  MAX_TYPE_TREE_DEPTH,
  typeDepth,
  typeHeight,
  typePath,
} from '../lib/type-tree';
import { issueBelongsToDefinition } from './validation-issues';

import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { CatalogueIssueSources, CatalogueOperation, CatalogueType } from './types';

interface ParentChoice {
  readonly disabled: boolean;
  readonly id: string;
  readonly path: string;
  readonly reason?: string;
}

const TOP_LEVEL_PARENT_VALUE = '__catalogue_top_level__';
const EMPTY_ISSUE_SOURCES: CatalogueIssueSources = [];

function parentChoices(
  types: readonly CatalogueType[],
  editedType: CatalogueType | undefined
): ParentChoice[] {
  const editedHeight = editedType === undefined ? 1 : typeHeight(types, editedType.id);
  const descendants = new Set(editedType === undefined ? [] : descendantIds(types, editedType.id));
  return types.map((candidate) => {
    let reason: string | undefined;
    const candidateDepth = typeDepth(types, candidate.id) + editedHeight;
    if (candidate.id === editedType?.id) reason = 'A type cannot be its own parent.';
    else if (candidate.archivedAt !== null) reason = 'Archived types cannot become parents.';
    else if (descendants.has(candidate.id)) {
      reason = 'A type cannot be parented below its descendant.';
    } else if (candidateDepth > MAX_TYPE_TREE_DEPTH) {
      reason = `Depth ${String(candidateDepth)} exceeds the cap of ${String(MAX_TYPE_TREE_DEPTH)}.`;
    }
    return {
      disabled: reason !== undefined,
      id: candidate.id,
      path: typePath(types, candidate.id).join(' › '),
      reason,
    };
  });
}

/** Renders the parent chooser and the validation/refusal states around it. */
export function ParentTypeChooser({
  editedType,
  editable,
  issueSources = EMPTY_ISSUE_SOURCES,
  issues,
  onChange,
  operation,
  types,
  value,
}: {
  readonly editedType: CatalogueType | undefined;
  readonly editable: boolean;
  readonly issueSources?: CatalogueIssueSources;
  readonly issues: readonly InventoryApiIssue[];
  readonly onChange: (value: string | null) => void;
  readonly operation: CatalogueOperation | null;
  readonly types: readonly CatalogueType[];
  readonly value: string | null;
}) {
  const parent = types.find((candidate) => candidate.id === editedType?.parentTypeId);
  const parentLabel = parent === undefined ? 'Top level' : typePath(types, parent.id).join(' › ');
  if (!editable && editedType !== undefined) {
    return (
      <Alert className="sm:col-span-2">
        <AlertTitle>Published type parent cannot change</AlertTitle>
        <AlertDescription>
          {editedType.label} is published with parent {parentLabel}. This editor draws the refusal;
          it does not offer a migration.
        </AlertDescription>
      </Alert>
    );
  }
  const choices = [
    { disabled: false, id: TOP_LEVEL_PARENT_VALUE, path: 'Top level' },
    ...parentChoices(types, editedType),
  ];
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor="catalogue-type-parent-picker">Parent</Label>
      <ParentPicker choices={choices} editable={editable} onChange={onChange} value={value} />
      <p className="text-xs text-muted-foreground">
        Parent and leaf types can both be selected. A parent leaves room for every descendant.
      </p>
      <ParentChoiceReasons choices={choices} />
      <ParentValidationIssues
        editedType={editedType}
        issueSources={issueSources}
        issues={issues}
        operation={operation}
      />
    </div>
  );
}

function ParentPicker({
  choices,
  editable,
  onChange,
  value,
}: {
  readonly choices: readonly ParentChoice[];
  readonly editable: boolean;
  readonly onChange: (value: string | null) => void;
  readonly value: string | null;
}) {
  return (
    <ComboboxSelect
      id="catalogue-type-parent-picker"
      aria-label="Parent"
      disabled={!editable}
      options={choices.map((choice) => ({
        disabled: choice.disabled,
        label: choice.path,
        value: choice.id,
      }))}
      placeholder="Top level"
      searchPlaceholder="Search types by name or path"
      emptyMessage="No type matches this path."
      value={value ?? TOP_LEVEL_PARENT_VALUE}
      onChange={(next) => {
        if (typeof next === 'string') onChange(next === TOP_LEVEL_PARENT_VALUE ? null : next);
      }}
    />
  );
}

function ParentValidationIssues({
  editedType,
  issueSources,
  issues,
  operation,
}: {
  readonly editedType: CatalogueType | undefined;
  readonly issueSources: CatalogueIssueSources;
  readonly issues: readonly InventoryApiIssue[];
  readonly operation: CatalogueOperation | null;
}) {
  return (
    <>
      {issues
        .filter(
          (issue) =>
            issue.path === 'parentTypeId' &&
            issueBelongsToDefinition(issue, editedType?.id, operation, issueSources)
        )
        .map((issue) => (
          <p
            key={`${issue.code}-${issue.definitionId ?? 'catalogue'}`}
            role="alert"
            className="text-sm text-destructive"
          >
            {issue.message}
          </p>
        ))}
    </>
  );
}

function ParentChoiceReasons({ choices }: { readonly choices: readonly ParentChoice[] }) {
  const refused = choices.filter((choice) => choice.reason !== undefined);
  if (refused.length === 0) return null;
  return (
    <ul aria-label="Parent choice reasons" className="space-y-1 text-xs text-muted-foreground">
      {refused.map((choice) => (
        <li key={choice.id}>
          <span className="font-medium">{choice.path}:</span> {choice.reason}
        </li>
      ))}
    </ul>
  );
}
