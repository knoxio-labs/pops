import type { CodeHolder } from './code-assist';
import type { ItemDraft } from './form-draft';

/** The successful item identity shown after Save and start another. */
export interface JustCreated {
  readonly name: string;
  readonly place: string;
  readonly itemId: string;
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
}

/** The result returned by one item-form save operation. */
export type SaveResult =
  | { readonly status: 'saved'; readonly result: SaveSuccess }
  | {
      readonly status: 'refused';
      readonly refusal: SaveRefusal;
      readonly initial?: ItemDraft;
    };
