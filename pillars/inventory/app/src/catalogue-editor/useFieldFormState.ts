import { useMemo, useState } from 'react';

import { expressionSelection } from './FieldFormOptions';
import { catalogueKeyFromLabel } from './types';

import type { BinaryOperation, FieldFormContextValue, FieldKind } from './FieldFormContext';
import type { CatalogueField, CatalogueType } from './types';

interface Args {
  readonly field?: CatalogueField;
  readonly published: boolean;
  readonly type: CatalogueType;
  readonly types: readonly CatalogueType[];
}

interface State {
  readonly changeKey: (value: string) => void;
  readonly changeLabel: (value: string) => void;
  readonly context: FieldFormContextValue;
  readonly valid: boolean;
}

function fieldCandidates(type: CatalogueType, field?: CatalogueField): CatalogueField[] {
  return type.fields.filter(
    (candidate) => candidate.id !== field?.id && candidate.archivedAt === null
  );
}

function orDefault<T>(value: T | null | undefined, defaultValue: T): T {
  if (value !== null && value !== undefined) return value;
  return defaultValue;
}

function initialIdentity(field?: CatalogueField) {
  return {
    help: orDefault(field?.help, ''),
    highlighted: field?.presentation.highlighted === true,
    keyEdited: field !== undefined,
    keyValue: orDefault(field?.key, ''),
    label: orDefault(field?.label, ''),
  };
}

function initialShape(field?: CatalogueField) {
  return {
    cardinality: orDefault(field?.cardinality, 'one' as const),
    fixedUnit: orDefault(field?.fixedUnit, ''),
    kind: orDefault(field?.kind, 'short_text' as const),
    required: orDefault(field?.required, false),
    storage: orDefault(field?.storage, 'stored' as const),
  };
}

function initialReferences(field?: CatalogueField) {
  return {
    referenceKinds: orDefault(field?.referenceKinds, ['item'] as const),
    referenceTypeIds: orDefault(field?.referenceTypeIds, []),
  };
}

function initialExpression(
  field: CatalogueField | undefined,
  candidates: readonly CatalogueField[]
) {
  const parsed = expressionSelection(field?.expression);
  return {
    allowOverride: orDefault(field?.allowOverride, false),
    expressionOperation: orDefault(parsed?.operation, 'multiply' as const),
    leftFieldId: orDefault(parsed?.left, orDefault(candidates[0]?.id, '')),
    rightFieldId: orDefault(
      parsed?.right,
      orDefault(candidates[1]?.id, orDefault(candidates[0]?.id, ''))
    ),
  };
}

function initialValues(field: CatalogueField | undefined, candidates: readonly CatalogueField[]) {
  return {
    ...initialIdentity(field),
    ...initialShape(field),
    ...initialReferences(field),
    ...initialExpression(field, candidates),
  };
}

function useFormValues(initial: ReturnType<typeof initialValues>) {
  const [label, setLabel] = useState(initial.label);
  const [keyValue, setKeyValue] = useState(initial.keyValue);
  const [keyEdited, setKeyEdited] = useState(initial.keyEdited);
  const [help, setHelp] = useState(initial.help);
  const [kind, setKind] = useState<FieldKind>(initial.kind);
  const [cardinality, setCardinality] = useState<'one' | 'many'>(initial.cardinality);
  const [required, setRequired] = useState(initial.required);
  const [highlighted, setHighlighted] = useState(initial.highlighted);
  const [fixedUnit, setFixedUnit] = useState(initial.fixedUnit);
  const [referenceKinds, setReferenceKinds] = useState<readonly ('item' | 'location')[]>(
    initial.referenceKinds
  );
  const [referenceTypeIds, setReferenceTypeIds] = useState<readonly string[]>(
    initial.referenceTypeIds
  );
  const [storage, setStorage] = useState<'stored' | 'computed'>(initial.storage);
  const [allowOverride, setAllowOverride] = useState(initial.allowOverride);
  const [expressionOperation, setExpressionOperation] = useState<BinaryOperation>(
    initial.expressionOperation
  );
  const [leftFieldId, setLeftFieldId] = useState(initial.leftFieldId);
  const [rightFieldId, setRightFieldId] = useState(initial.rightFieldId);
  return {
    allowOverride,
    cardinality,
    expressionOperation,
    fixedUnit,
    help,
    highlighted,
    keyEdited,
    keyValue,
    kind,
    label,
    leftFieldId,
    referenceKinds,
    referenceTypeIds,
    required,
    rightFieldId,
    storage,
    setAllowOverride,
    setCardinality,
    setExpressionOperation,
    setFixedUnit,
    setHelp,
    setHighlighted,
    setKeyEdited,
    setKeyValue,
    setKind,
    setLabel,
    setLeftFieldId,
    setReferenceKinds,
    setReferenceTypeIds,
    setRequired,
    setRightFieldId,
    setStorage,
  };
}

function formContext(
  form: ReturnType<typeof useFormValues>,
  { field, published, types }: Args,
  candidates: readonly CatalogueField[]
): FieldFormContextValue {
  return { ...form, candidates, field, shapeLocked: published, types };
}

function isValid(value: FieldFormContextValue): boolean {
  return (
    value.label.trim() !== '' &&
    (value.field !== undefined || value.keyValue !== '') &&
    (value.kind !== 'measurement' || value.fixedUnit.trim() !== '') &&
    (value.storage === 'stored' || (value.leftFieldId !== '' && value.rightFieldId !== ''))
  );
}

/** Owns the controlled values shared by the field-editor sections. */
export function useFieldFormState(args: Args): State {
  const candidates = useMemo(() => fieldCandidates(args.type, args.field), [args.field, args.type]);
  const form = useFormValues(initialValues(args.field, candidates));
  const context = formContext(form, args, candidates);
  return {
    context,
    valid: isValid(context),
    changeLabel: (value) => {
      form.setLabel(value);
      if (args.field === undefined && !form.keyEdited) {
        form.setKeyValue(catalogueKeyFromLabel(value));
      }
    },
    changeKey: (value) => {
      form.setKeyEdited(true);
      form.setKeyValue(catalogueKeyFromLabel(value));
    },
  };
}
