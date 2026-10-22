import { useState } from 'react';

import { TypeFormActions } from './TypeFormActions';
import { TypeFormDetails } from './TypeFormDetails';
import { catalogueKeyFromLabel } from './types';
import { useOperationPreview } from './useOperationPreview';

import type { InventoryApiIssue } from '../inventory-api-helpers';
import type { CatalogueIssueSources, CatalogueOperation, CatalogueType } from './types';

interface TypeFormProps {
  readonly isPending: boolean;
  readonly onArchive?: () => void;
  readonly onRestore?: () => void;
  readonly onPreview?: (operation: CatalogueOperation) => void;
  readonly onSave: (operation: CatalogueOperation) => void;
  readonly issueSources?: CatalogueIssueSources;
  readonly issues?: readonly InventoryApiIssue[];
  readonly published?: boolean;
  readonly types?: readonly CatalogueType[];
  readonly type?: CatalogueType;
}

const EMPTY_ISSUES: readonly InventoryApiIssue[] = [];
const EMPTY_ISSUE_SOURCES: CatalogueIssueSources = [];
const EMPTY_TYPES: readonly CatalogueType[] = [];

const CONTAINMENT = 'containment';
const PARTS = 'parts';

/** The type's capabilities with the two editable toggles applied and every other one kept. */
function nextCapabilities(
  existing: readonly string[],
  containment: boolean,
  parts: boolean
): string[] {
  const kept = existing.filter((capability) => capability !== CONTAINMENT && capability !== PARTS);
  return [...(containment ? [CONTAINMENT] : []), ...(parts ? [PARTS] : []), ...kept];
}

function typeOperation({
  containment,
  parts,
  description,
  key,
  label,
  parentTypeId,
  type,
}: {
  readonly containment: boolean;
  readonly parts: boolean;
  readonly description: string;
  readonly key: string;
  readonly label: string;
  readonly parentTypeId: string | null;
  readonly type: CatalogueType | undefined;
}): CatalogueOperation {
  return {
    kind: 'put_type',
    ...(type === undefined ? { key: catalogueKeyFromLabel(key) } : { id: type.id }),
    label: label.trim(),
    description: description.trim().length === 0 ? null : description.trim(),
    capabilities: nextCapabilities(type?.capabilities ?? [], containment, parts),
    parentTypeId,
  };
}

function typeFormIsValid(label: string, key: string, type: CatalogueType | undefined): boolean {
  return label.trim().length > 0 && (type !== undefined || catalogueKeyFromLabel(key).length > 0);
}

/** Edits type identity and capabilities, or creates a new catalogue type. */
export function TypeForm({
  isPending,
  onArchive,
  onPreview,
  onRestore,
  onSave,
  issueSources = EMPTY_ISSUE_SOURCES,
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
        parts={formState.parts}
        description={formState.description}
        keyValue={formState.key}
        label={formState.label}
        parentTypeId={formState.parentTypeId}
        parentEditable={!published}
        type={type}
        types={types}
        issueSources={issueSources}
        operation={formState.operation}
        validationIssues={issues}
        onContainmentChange={formState.setContainment}
        onPartsChange={formState.setParts}
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

function useCapabilityToggles(type: CatalogueType | undefined) {
  const capabilities = type?.capabilities ?? [];
  const [containment, setContainment] = useState(capabilities.includes(CONTAINMENT));
  const [parts, setParts] = useState(capabilities.includes(PARTS));
  return { containment, parts, setContainment, setParts };
}

function useTypeFormState(
  type: CatalogueType | undefined,
  onPreview?: (operation: CatalogueOperation) => void
) {
  const [label, setLabel] = useState(type?.label ?? '');
  const [key, setKey] = useState(type?.key ?? '');
  const [description, setDescription] = useState(type?.description ?? '');
  const [parentTypeId, setParentTypeId] = useState(type?.parentTypeId ?? null);
  const { containment, parts, setContainment, setParts } = useCapabilityToggles(type);
  const [keyEdited, setKeyEdited] = useState(type !== undefined);
  const valid = typeFormIsValid(label, key, type);
  const operation = valid
    ? typeOperation({ containment, parts, description, key, label, parentTypeId, type })
    : null;
  useOperationPreview(operation, onPreview);

  const changeLabel = (value: string) => {
    setLabel(value);
    if (type === undefined && !keyEdited) setKey(catalogueKeyFromLabel(value));
  };
  const changeKey = (value: string) => {
    setKeyEdited(true);
    setKey(value);
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
    parts,
    setContainment,
    setDescription,
    setParentTypeId,
    setParts,
    valid,
  };
}
