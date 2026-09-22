import { createContext, useContext } from 'react';

import type { Dispatch, SetStateAction } from 'react';

import type { CatalogueField, CatalogueType } from './types';

/** A primitive field kind accepted by catalogue authoring. */
export type FieldKind = CatalogueField['kind'];
/** A supported closed binary computed-field operation. */
export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide';
type ReferenceKind = 'item' | 'location';

/** Controlled field form values shared by independently rendered sections. */
export interface FieldFormContextValue {
  readonly candidates: readonly CatalogueField[];
  readonly cardinality: 'one' | 'many';
  readonly field?: CatalogueField;
  readonly fixedUnit: string;
  readonly help: string;
  readonly highlighted: boolean;
  readonly keyValue: string;
  readonly kind: FieldKind;
  readonly label: string;
  readonly leftFieldId: string;
  readonly referenceKinds: readonly ReferenceKind[];
  readonly referenceTypeIds: readonly string[];
  readonly required: boolean;
  readonly rightFieldId: string;
  readonly shapeLocked: boolean;
  readonly storage: 'stored' | 'computed';
  readonly types: readonly CatalogueType[];
  readonly allowOverride: boolean;
  readonly expressionOperation: BinaryOperation;
  readonly setAllowOverride: Dispatch<SetStateAction<boolean>>;
  readonly setCardinality: Dispatch<SetStateAction<'one' | 'many'>>;
  readonly setExpressionOperation: Dispatch<SetStateAction<BinaryOperation>>;
  readonly setFixedUnit: Dispatch<SetStateAction<string>>;
  readonly setHelp: Dispatch<SetStateAction<string>>;
  readonly setHighlighted: Dispatch<SetStateAction<boolean>>;
  readonly setKeyValue: Dispatch<SetStateAction<string>>;
  readonly setKind: Dispatch<SetStateAction<FieldKind>>;
  readonly setLabel: Dispatch<SetStateAction<string>>;
  readonly setLeftFieldId: Dispatch<SetStateAction<string>>;
  readonly setReferenceKinds: Dispatch<SetStateAction<readonly ReferenceKind[]>>;
  readonly setReferenceTypeIds: Dispatch<SetStateAction<readonly string[]>>;
  readonly setRequired: Dispatch<SetStateAction<boolean>>;
  readonly setRightFieldId: Dispatch<SetStateAction<string>>;
  readonly setStorage: Dispatch<SetStateAction<'stored' | 'computed'>>;
}

const FieldFormContext = createContext<FieldFormContextValue | null>(null);

/** Provides one field form's controlled state to its editor sections. */
export const FieldFormProvider = FieldFormContext.Provider;

/** Returns the current field form or fails when used outside its provider. */
export function useFieldFormContext(): FieldFormContextValue {
  const value = useContext(FieldFormContext);
  if (value === null) throw new Error('Field form controls require a FieldFormProvider.');
  return value;
}
