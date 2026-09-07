/**
 * Edit-model types for the product dictionary controls: the filter state the
 * filter row owns, and the corrections a row can send upward. These are the
 * playground's own types, not a mirror of the wire's edit payloads — each
 * `DictionaryEdit` is applied locally by `applyDictionaryEdit` in `edits.ts`.
 */

/**
 * Which side of the assertion boundary to keep.
 *
 * `asserted` and `unasserted` are complements rather than overlapping
 * filters: a half-merged product — one wording asserted, one still a
 * proposal — is unfinished work and answers `unasserted`.
 */
export type AssertionFilter = 'all' | 'asserted' | 'unasserted';

/** The unfiltered case. */
export const ANY_SOURCE = 'all';

export interface DictionaryFilterState {
  readonly source: string;
  readonly assertion: AssertionFilter;
}

export const DEFAULT_DICTIONARY_FILTERS: DictionaryFilterState = {
  source: ANY_SOURCE,
  assertion: 'all',
};

/**
 * One correction, named by what it does to the dictionary rather than by the
 * verb that carries it. The two undo paths (`split`, `retract`) are
 * first-class members for the same reason the app's page gives: an undo left
 * as a flag on the path it undoes is the undo nobody finds.
 */
export type DictionaryEdit =
  | { readonly kind: 'merge'; readonly aliasId: string; readonly productId: string }
  | { readonly kind: 'split'; readonly aliasId: string }
  | { readonly kind: 'assert'; readonly aliasId: string }
  | { readonly kind: 'retract'; readonly aliasId: string }
  | { readonly kind: 'forgetWording'; readonly aliasId: string }
  | { readonly kind: 'forgetWordingWithProduct'; readonly aliasId: string }
  | { readonly kind: 'rename'; readonly productId: string; readonly label: string }
  | { readonly kind: 'forgetProduct'; readonly productId: string };

export type DictionaryEditKind = DictionaryEdit['kind'];

export interface EditOutcome {
  readonly kind: DictionaryEditKind;
  readonly status: 'ok' | 'error';
  readonly message: string | null;
}
