/**
 * Which stored tags sit outside the vocabulary, and which of those anything is
 * still accounting for.
 *
 * Split from `tag-coverage.ts` because it answers a different question from the
 * facet counts: not "is this row tagged" but "is this row's tag a value the
 * vocabulary still recognises". The gate needs both, and only this half has to
 * know that the retirement migrations deliberately strand a value on a row they
 * cannot resolve (POPS-2683).
 */
import { NEEDS_REVIEW_TAG } from '../tag-facets.js';

/**
 * What the vocabulary holds, split by whether a value is still offered.
 *
 * Both halves are needed to tell a *retired* value from an *unrecognised* one,
 * and only the caller knows where they come from — the audit script reads the
 * live table, a test supplies a fixture.
 */
export interface TagVocabularySnapshot {
  /** Values still offered to the categorizer — `is_active = 1`. */
  active: string[];
  /** Every value the vocabulary holds, retired ones included. */
  known: string[];
}

/** A stored tag that is not an active vocabulary row. */
export interface UnknownTagUsage {
  tag: string;
  transactions: number;
  /**
   * Whether the vocabulary holds this value but has retired it, as opposed to
   * never having held it at all.
   *
   * A retired value on a row is a deliberate product of the retirement
   * migrations, which keep it as evidence rather than destroying it. A value
   * the vocabulary has never held is something else — a typo, or a write that
   * bypassed validation — and nothing accounts for it.
   */
  retired: boolean;
  /** Of those transactions, how many do NOT carry {@link NEEDS_REVIEW_TAG}. */
  unflagged: number;
}

export function buildUnknownTagUsage(
  rows: { tags: string[] }[],
  vocabulary: TagVocabularySnapshot
): UnknownTagUsage[] {
  const active = new Set(vocabulary.active);
  const known = new Set(vocabulary.known);
  const counts = new Map<string, { transactions: number; unflagged: number }>();

  for (const row of rows) {
    const flagged = row.tags.includes(NEEDS_REVIEW_TAG);
    for (const tag of new Set(row.tags)) {
      if (active.has(tag)) continue;
      const entry = counts.get(tag) ?? { transactions: 0, unflagged: 0 };
      entry.transactions += 1;
      if (!flagged) entry.unflagged += 1;
      counts.set(tag, entry);
    }
  }

  return [...counts.entries()]
    .map(([tag, entry]) => ({
      tag,
      transactions: entry.transactions,
      retired: known.has(tag),
      unflagged: entry.unflagged,
    }))
    .toSorted((a, b) => b.transactions - a.transactions || a.tag.localeCompare(b.tag));
}

/**
 * Whether a stranded tag is work nothing else is tracking (POPS-2683).
 *
 * A *retired* value on a row carrying {@link NEEDS_REVIEW_TAG} is neither — the
 * retirement migrations produce that pair deliberately, keeping the tag because
 * it is the only surviving evidence of what the row is, and setting the flag to
 * record that a human owes it a decision. Gating on it would report one debt
 * twice, and would quietly turn the coverage gate into a "has anyone written
 * the classifier pattern yet" gate, which is a different question with a
 * different owner.
 *
 * The exemption is deliberately narrow. A retired value on an *unflagged* row
 * is unaccounted for, and a value the vocabulary has *never* held is a typo or
 * a write that bypassed validation — neither is excused by a flag.
 */
export function isUntrackedStrandedTag(usage: UnknownTagUsage): boolean {
  return !usage.retired || usage.unflagged > 0;
}
