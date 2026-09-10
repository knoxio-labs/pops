/**
 * What may be written to a contact's `defaultTags`.
 *
 * `defaultTags` is a fact about a merchant that the tag-suggester's entity pass
 * re-proposes on every future import (POPS-2609), so a value that is not in the
 * vocabulary is not a one-off mistake — it is a wrong suggestion that returns
 * forever, and the only thing that ever removes it is a person stripping it by
 * hand each time. Fifteen contacts carried `venue:bar`, a value no transaction
 * has ever carried and that the vocabulary has never held, on all of them as
 * their only default (POPS-3293).
 *
 * **Finance validates, not contacts.** The vocabulary is a finance table;
 * contacts owns `defaultTags` and has no idea what a tag means, and giving it
 * one would make a contact write depend on finance being up. So the check sits
 * on this side of the seam, ahead of the wire. The cost is stated rather than
 * hidden: an edit made directly against contacts still bypasses it. That is not
 * a gap this can close, and closing it would mean contacts either duplicating
 * the vocabulary or calling finance to save a contact.
 *
 * Nothing here is facet-aware. `defaultTags` happens to hold only `venue:`
 * values today, and the hole admitted any unknown tag — so what is enforced is
 * membership, for every facet, rather than a rule about one.
 */
import { tagVocabularyService } from '../../db/index.js';

import type { KnownTagSet } from '../../db/services/tag-vocabulary.js';

/**
 * A `defaultTags` write naming a value the vocabulary does not hold.
 *
 * Its own type so a caller can tell it from an outage: this one never succeeds
 * on retry, and the fix is to the input rather than to the peer.
 */
export class UnknownDefaultTagError extends Error {
  /** The offending values, in the order they were given. */
  readonly tags: readonly string[];

  constructor(entityId: string, tags: readonly string[]) {
    super(
      `refusing to write defaultTags for ${entityId}: ${tags.join(', ')} ` +
        'not in the tag vocabulary. A default the vocabulary does not hold is ' +
        're-proposed on every future import and stripped by hand every time'
    );
    this.name = 'UnknownDefaultTagError';
    this.tags = tags;
  }
}

/**
 * The values in `defaultTags` the vocabulary does not hold, in order.
 *
 * Blank entries count as unknown rather than being skipped: an empty tag is not
 * a tag, and letting one through would put a value on a contact that no reader
 * can act on. Comparison is the vocabulary's own, via
 * {@link tagVocabularyService.normalizeTagForComparison}, so case is not what decides it.
 */
export function unknownDefaultTags(defaultTags: readonly string[], known: KnownTagSet): string[] {
  return defaultTags.filter(
    (tag) => !known.has(tag) || tagVocabularyService.normalizeTagForComparison(tag) === ''
  );
}

/**
 * Refuse the whole write when any value is unknown.
 *
 * All or nothing, not filter-and-send. A `defaultTags` patch replaces the
 * list, so writing the subset that passed would silently drop a reviewed human
 * call — and the operator would see a successful run having lost it.
 *
 * @throws {UnknownDefaultTagError}
 */
export function assertKnownDefaultTags(
  entityId: string,
  defaultTags: readonly string[],
  known: KnownTagSet
): void {
  const unknown = unknownDefaultTags(defaultTags, known);
  if (unknown.length > 0) throw new UnknownDefaultTagError(entityId, unknown);
}
