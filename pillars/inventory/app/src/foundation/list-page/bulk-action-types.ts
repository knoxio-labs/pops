/** The four actions opened from the live item-selection bar. */
export type BulkActionKind = 'set-type' | 'set-field' | 'retire' | 'discard';

/** A captured selection for a bulk action, stable while its sheet is open. */
export interface BulkActionState {
  readonly kind: BulkActionKind;
  readonly ids: readonly string[];
}
