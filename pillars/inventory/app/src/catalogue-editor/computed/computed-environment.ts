import { createContext, useContext } from 'react';

import type { InventoryApiIssue } from '../../inventory-api-helpers';
import type {
  CatalogueCompatibility,
  CatalogueDescriptor,
  CatalogueField,
  CatalogueOperation,
  CatalogueType,
} from '../types';

/** What the catalogue page knows that the computed-field editor needs beyond the form. */
export interface ComputedFieldEnvironment {
  /** The editable draft, or null while none exists yet. */
  readonly draft: CatalogueDescriptor | null;
  /** This field as the published catalogue has it, when it is published. */
  readonly publishedField: CatalogueField | undefined;
  readonly publishedRevision: number | undefined;
  /** Issues from the last refused save. */
  readonly saveIssues: readonly InventoryApiIssue[];
  /** Issues from the latest non-mutating draft preview of the unsaved edit. */
  readonly liveIssues: readonly InventoryApiIssue[];
  /** The latest compatibility evidence for the draft, saved or live. */
  readonly compatibility: CatalogueCompatibility | null;
  /** The operations `compatibility` was computed against, empty when it came from a recheck. */
  readonly compatibilityOperations: readonly CatalogueOperation[];
}

/** An environment with no draft, no issues and no compatibility evidence. */
export const EMPTY_COMPUTED_ENVIRONMENT: ComputedFieldEnvironment = {
  draft: null,
  publishedField: undefined,
  publishedRevision: undefined,
  saveIssues: [],
  liveIssues: [],
  compatibility: null,
  compatibilityOperations: [],
};

/** The field form's side of the computed editor: its type, its operation and its last submit. */
export interface ComputedSection {
  readonly environment: ComputedFieldEnvironment;
  readonly type: CatalogueType;
  /** The operation the form would save now, or null while it is not valid. */
  readonly operation: CatalogueOperation | null;
  /** The serialised operation last submitted, to tell a refusal of this edit from an older one. */
  readonly submitted: string | null;
}

const ComputedSectionContext = createContext<ComputedSection | null>(null);

/** Provides the computed editor's page and form context to the field form's sections. */
export const ComputedSectionProvider = ComputedSectionContext.Provider;

/** Returns the enclosing computed section or fails outside a field form. */
export function useComputedSection(): ComputedSection {
  const section = useContext(ComputedSectionContext);
  if (section === null) throw new Error('The computed editor requires a ComputedSectionProvider.');
  return section;
}
