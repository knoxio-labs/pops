/** Identifies one inventory item for a targeted sync read. */
export interface ItemRequest {
  readonly itemId: string;
}

/** Describes the input for deterministic inventory code suggestions. */
export interface SuggestCodesRequest {
  readonly name: string;
  readonly typeKey: string | null;
  readonly stem: string | null;
}
