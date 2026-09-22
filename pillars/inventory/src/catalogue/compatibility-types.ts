/** Publication compatibility, ordered from least to most restrictive. */
export type CatalogueCompatibilityClassification =
  | 'compatible'
  | 'protocol_gated'
  | 'migration_required'
  | 'forbidden';

/** One machine-readable reason contributing to a catalogue classification. */
export interface CatalogueCompatibilityChange {
  readonly classification: CatalogueCompatibilityClassification;
  readonly definitionId: string;
  readonly code: string;
}

/** The complete compatibility proof for a candidate catalogue revision. */
export interface CatalogueCompatibilityResult {
  readonly classification: CatalogueCompatibilityClassification;
  readonly affectedIds: readonly string[];
  readonly changes: readonly CatalogueCompatibilityChange[];
}
