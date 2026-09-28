import { FieldForm } from '../catalogue-editor/FieldForm';

import type { ComputedFieldEnvironment } from '../catalogue-editor/computed/computed-environment';
import type {
  CatalogueField,
  CatalogueIssueSources,
  CatalogueOperation,
  CatalogueOperationHandler,
  CatalogueType,
} from '../catalogue-editor/types';
import type { InventoryApiIssue } from '../inventory-api-helpers';

interface Props {
  readonly computed: ComputedFieldEnvironment;
  readonly editorEpoch: number;
  readonly field: CatalogueField;
  readonly isPending: boolean;
  readonly issues: readonly InventoryApiIssue[];
  readonly issueSources: CatalogueIssueSources;
  readonly onArchive: () => void;
  readonly onOperation: CatalogueOperationHandler;
  readonly onPreview: (operation: CatalogueOperation) => void;
  readonly onRestore: () => void;
  readonly published: boolean;
  readonly type: CatalogueType;
  readonly types: readonly CatalogueType[];
}

/** Renders the selected persisted field and its lifecycle actions. */
export function ExistingFieldForm({
  computed,
  editorEpoch,
  field,
  isPending,
  issues,
  issueSources,
  onArchive,
  onOperation,
  onPreview,
  onRestore,
  published,
  type,
  types,
}: Props) {
  return (
    <FieldForm
      key={`${field.id}-${editorEpoch}`}
      computed={computed}
      field={field}
      type={type}
      types={types}
      published={published}
      isPending={isPending}
      issueSources={issueSources}
      issues={issues}
      onOperation={onOperation}
      onPreview={onPreview}
      onArchive={onArchive}
      onRestore={onRestore}
    />
  );
}
