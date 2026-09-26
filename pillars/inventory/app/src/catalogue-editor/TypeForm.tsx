import { useState } from 'react';

import { TypeFormActions } from './TypeFormActions';
import { TypeFormDetails } from './TypeFormDetails';
import { catalogueKeyFromLabel } from './types';
import { useOperationPreview } from './useOperationPreview';

import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { CatalogueOperation, CatalogueType } from './types';

interface TypeFormProps {
  readonly isPending: boolean;
  readonly onArchive?: () => void;
  readonly onRestore?: () => void;
  readonly onPreview?: (operation: CatalogueOperation) => void;
  readonly onSave: (operation: CatalogueOperation) => void;
  readonly issues?: readonly InventoryApiIssue[];
  readonly published?: boolean;
  readonly types?: readonly CatalogueType[];
  readonly type?: CatalogueType;
}

const EMPTY_ISSUES: readonly InventoryApiIssue[] = [];
const EMPTY_TYPES: readonly CatalogueType[] = [];

function typeOperation({
  containment,
  description,
  key,
  label,
  parentTypeId,
  type,
}: {
  readonly containment: boolean;
  readonly description: string;
  readonly key: string;
  readonly label: string;
  readonly parentTypeId: string | null;
  readonly type: CatalogueType | undefined;
}): CatalogueOperation {
  return {
    kind: 'put_type',
    ...(type === undefined ? { key: key.trim() } : { id: type.id }),
    label: label.trim(),
    description: description.trim().length === 0 ? null : description.trim(),
    capabilities: containment ? ['containment'] : [],
    parentTypeId,
  };
}

function typeFormIsValid(label: string, key: string, type: CatalogueType | undefined): boolean {
  return label.trim().length > 0 && (type !== undefined || key.trim().length > 0);
}

/** Edits type identity and capabilities, or creates a new catalogue type. */
export function TypeForm({
  isPending,
  onArchive,
  onPreview,
  onRestore,
  onSave,
  issues = EMPTY_ISSUES,
  published = false,
  types = EMPTY_TYPES,
  type,
}: TypeFormProps) {
  const formState = useTypeFormState(type, onPreview);
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (formState.operation !== null) onSave(formState.operation);
      }}
    >
      <TypeFormDetails
        containment={formState.containment}
        description={formState.description}
        keyValue={formState.key}
        label={formState.label}
        parentTypeId={formState.parentTypeId}
        parentEditable={!published}
        type={type}
        types={types}
        validationIssues={issues}
        onContainmentChange={formState.setContainment}
        onDescriptionChange={formState.setDescription}
        onKeyChange={formState.changeKey}
        onLabelChange={formState.changeLabel}
        onParentChange={formState.setParentTypeId}
      />
      <TypeFormActions
        isPending={isPending}
        isValid={formState.valid}
        type={type}
        onArchive={onArchive}
        onRestore={onRestore}
      />
    </form>
  );
}

function useTypeFormState(
  type: CatalogueType | undefined,
  onPreview?: (operation: CatalogueOperation) => void
) {
  const [label, setLabel] = useState(type?.label ?? '');
  const [key, setKey] = useState(type?.key ?? '');
  const [description, setDescription] = useState(type?.description ?? '');
  const [parentTypeId, setParentTypeId] = useState(type?.parentTypeId ?? null);
  const [containment, setContainment] = useState(
    type?.capabilities.includes('containment') ?? false
  );
  const [keyEdited, setKeyEdited] = useState(type !== undefined);
  const valid = typeFormIsValid(label, key, type);
  const operation = valid
    ? typeOperation({ containment, description, key, label, parentTypeId, type })
    : null;
  useOperationPreview(operation, onPreview);

  const changeLabel = (value: string) => {
    setLabel(value);
    if (type === undefined && !keyEdited) setKey(catalogueKeyFromLabel(value));
  };
  const changeKey = (value: string) => {
    setKeyEdited(true);
    setKey(catalogueKeyFromLabel(value));
  };
  return {
    changeKey,
    changeLabel,
    containment,
    description,
    key,
    label,
    operation,
    parentTypeId,
    setContainment,
    setDescription,
    setParentTypeId,
    valid,
  };
}
