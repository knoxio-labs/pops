/**
 * View types for the learned product dictionary, derived from the generated
 * client.
 *
 * Everything here is an alias into `purchases-api/types.gen.ts` rather than a
 * hand-written mirror, for the reason the reconcile queue's `types.ts` gives:
 * the wire shape changes whenever the pillar's contract does, and a mirror
 * would keep compiling while rendering fields the server no longer sends.
 */
import type {
  ProductListResponses,
  ProductProposeResponses,
} from '../../purchases-api/types.gen.js';

type DictionaryPayload = NonNullable<ProductListResponses[200]>;

/** A product a human recognises, with every printed wording that reaches it. */
export type DictionaryProduct = DictionaryPayload['products'][number];

/** One printed wording that resolves to a product. */
export type DictionaryAlias = DictionaryProduct['aliases'][number];

/** What one run of the proposal pass changed. */
export type ProposalOutcome = NonNullable<ProductProposeResponses[200]>;

/**
 * Which side of the assertion boundary to keep.
 *
 * `asserted` and `unasserted` are complements rather than overlapping
 * filters, the same way the server's `confirmed` query is: a half-merged
 * product — one wording asserted, one still a proposal — is unfinished work
 * and answers `unasserted`.
 */
export type AssertionFilter = 'all' | 'asserted' | 'unasserted';

/** The unfiltered case the wire spells by omitting the parameter. */
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
 * verb that carries it.
 *
 * The two undo paths are first-class members of this union rather than a flag
 * on the paths they undo: `split` is the whole answer to a wrong merge and
 * `retract` to a wrong assertion, and a surface where an undo is a variant of
 * a do is a surface where the undo is the one nobody finds.
 *
 * `forgetWordingWithProduct` rides the same route as `forgetWording` and is a
 * separate member for the same reason: forgetting the last wording reaching a
 * named product also deletes the product, which is a different thing to have
 * done to the dictionary and has to be a different thing said afterwards.
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
