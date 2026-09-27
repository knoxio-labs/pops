import type { InventoryCommand } from '../../inventory-web/commands.js';
import type { CodeHolder } from './code-assist';
import type { ItemDraft } from './form-draft';

/** Options accepted by one inventory mutation sender used by the form. */
export interface SendCommandOptions {
  readonly baseRevision?: number;
  readonly catalogueRevision?: number;
}

/** Sends one inventory mutation command and returns the normalized save result. */
export type SendCommand = (
  command: InventoryCommand,
  entityId: string,
  options?: SendCommandOptions
) => Promise<SaveResult>;

/** The successful item identity shown after Save and start another. */
export interface JustCreated {
  readonly name: string;
  readonly place: string;
  readonly itemId: string;
  readonly photos: number;
}

/** A save refusal that the form can render without losing the draft. */
export type SaveRefusal =
  | {
      readonly kind: 'code-taken';
      readonly suggestedCode: string | null;
      readonly holder: CodeHolder;
    }
  | { readonly kind: 'message'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

/** The successful identity returned by a create or edit save. */
export interface SaveSuccess {
  readonly itemId: string;
  readonly revision: number | null;
  readonly photos?: number;
}

/** The result returned by one item-form save operation. */
export type SaveResult =
  | { readonly status: 'saved'; readonly result: SaveSuccess }
  | {
      readonly status: 'refused';
      readonly refusal: SaveRefusal;
      readonly initial?: ItemDraft;
      readonly revision?: number;
    };
