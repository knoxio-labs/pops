import { useState } from 'react';

import { TypeFormActions } from './TypeFormActions';
import { TypeFormDetails } from './TypeFormDetails';
import { catalogueKeyFromLabel } from './types';
import { useOperationPreview } from './useOperationPreview';

import type { CatalogueOperation, CatalogueType } from './types';

interface TypeFormProps {
  readonly isPending: boolean;
  readonly onArchive?: () => void;
  readonly onRestore?: () => void;
  readonly onPreview?: (operation: CatalogueOperation) => void;
  readonly onSave: (operation: CatalogueOperation) => void;
  readonly type?: CatalogueType;
}

function typeOperation({
  containment,
  description,
  key,
  label,
  type,
}: {
  readonly containment: boolean;
  readonly description: string;
  readonly key: string;
  readonly label: string;
  readonly type: CatalogueType | undefined;
}): CatalogueOperation {
  return {
    kind: 'put_type',
    ...(type === undefined ? { key: key.trim() } : { id: type.id }),
    label: label.trim(),
    description: description.trim().length === 0 ? null : description.trim(),
    capabilities: containment ? ['containment'] : [],
  };
}

/** Edits type identity and capabilities, or creates a new catalogue type. */
export function TypeForm({
  isPending,
  onArchive,
  onPreview,
  onRestore,
  onSave,
  type,
}: TypeFormProps) {
  const [label, setLabel] = useState(type?.label ?? '');
  const [key, setKey] = useState(type?.key ?? '');
  const [description, setDescription] = useState(type?.description ?? '');
  const [containment, setContainment] = useState(
    type?.capabilities.includes('containment') ?? false
  );
  const [keyEdited, setKeyEdited] = useState(type !== undefined);
  const valid = label.trim().length > 0 && (type !== undefined || key.trim().length > 0);
  const operation = valid ? typeOperation({ containment, description, key, label, type }) : null;
  useOperationPreview(operation, onPreview);

  const changeLabel = (value: string) => {
    setLabel(value);
    if (type === undefined && !keyEdited) setKey(catalogueKeyFromLabel(value));
  };
  const changeKey = (value: string) => {
    setKeyEdited(true);
    setKey(catalogueKeyFromLabel(value));
  };
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (operation !== null) onSave(operation);
      }}
    >
      <TypeFormDetails
        containment={containment}
        description={description}
        keyValue={key}
        label={label}
        type={type}
        onContainmentChange={setContainment}
        onDescriptionChange={setDescription}
        onKeyChange={changeKey}
        onLabelChange={changeLabel}
      />
      <TypeFormActions
        isPending={isPending}
        isValid={valid}
        type={type}
        onArchive={onArchive}
        onRestore={onRestore}
      />
    </form>
  );
}
