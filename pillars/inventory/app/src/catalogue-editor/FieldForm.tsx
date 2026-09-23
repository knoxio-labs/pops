import { FieldFormActions } from './FieldFormActions';
import { FieldFormBehaviour } from './FieldFormBehaviour';
import { FieldFormConstraints } from './FieldFormConstraints';
import { FieldFormProvider } from './FieldFormContext';
import { FieldFormIdentity } from './FieldFormIdentity';
import { EnumOptions } from './FieldFormOptions';
import { useFieldFormState } from './useFieldFormState';
import { useOperationPreview } from './useOperationPreview';

import type { FieldFormContextValue } from './FieldFormContext';
import type { CatalogueField, CatalogueOperation, CatalogueType } from './types';

interface FieldFormProps {
  readonly field?: CatalogueField;
  readonly isPending: boolean;
  readonly onArchive?: () => void;
  readonly onRestore?: () => void;
  readonly onOperation: (operation: CatalogueOperation) => void;
  readonly onPreview?: (operation: CatalogueOperation) => void;
  readonly published: boolean;
  readonly type: CatalogueType;
  readonly types: readonly CatalogueType[];
}

/** Creates or edits stored, enum, reference, and closed-expression computed fields. */
export function FieldForm(props: FieldFormProps) {
  const state = useFieldFormState(props);
  const operation = state.valid ? createOperation(state.context, props.type.id) : null;
  useOperationPreview(operation, props.onPreview);
  return (
    <FieldFormProvider value={state.context}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (operation !== null) props.onOperation(operation);
        }}
      >
        <FieldFormIdentity onKeyChange={state.changeKey} onLabelChange={state.changeLabel} />
        <FieldFormConstraints />
        <FieldFormBehaviour />
        {props.field !== undefined && state.context.kind === 'enum' && (
          <EnumOptions field={props.field} onOperation={props.onOperation} />
        )}
        <FieldFormActions
          field={props.field}
          isPending={props.isPending}
          isValid={state.valid}
          onArchive={props.onArchive}
          onRestore={props.onRestore}
        />
      </form>
    </FieldFormProvider>
  );
}

function createOperation(value: FieldFormContextValue, typeId: string): CatalogueOperation {
  const expression =
    value.storage === 'computed'
      ? {
          op: value.expressionOperation,
          left: { op: 'read' as const, path: [], fieldId: value.leftFieldId },
          right: { op: 'read' as const, path: [], fieldId: value.rightFieldId },
        }
      : null;
  return {
    kind: 'put_field',
    typeId,
    ...(value.field === undefined ? { key: value.keyValue } : { id: value.field.id }),
    label: value.label.trim(),
    help: value.help.trim() === '' ? null : value.help.trim(),
    required: value.required,
    presentation: { ...value.field?.presentation, highlighted: value.highlighted },
    ...(value.shapeLocked
      ? {}
      : {
          fieldKind: value.kind,
          cardinality:
            value.storage === 'computed' || value.kind === 'boolean' ? 'one' : value.cardinality,
          storage: value.storage,
          fixedUnit: value.kind === 'measurement' ? value.fixedUnit.trim() : null,
          referenceKinds: value.kind === 'reference' ? [...value.referenceKinds] : [],
          referenceTypeIds: value.kind === 'reference' ? [...value.referenceTypeIds] : [],
        }),
    ...(value.storage === 'computed'
      ? { expressionVersion: 1, expression, allowOverride: value.allowOverride }
      : { expressionVersion: null, expression: null, allowOverride: false }),
  };
}
