import {
  tagVocabularyService,
  transactionCorrectionsService,
  transactionsService,
  type FinanceDb,
} from '../../../db/index.js';
/**
 * Suggestion-impact preview for a tag-rule ChangeSet — the panel that answers
 * "what will this rule do?" before the user commits to it.
 *
 * It answers that by running the production suggester twice per row: once
 * over the persisted rule set (`before`) and once over that set with the
 * ChangeSet overlaid (`after`), diffing the two tag sets. That is the whole
 * design. It used to hardcode `before` to `[]` and match only the ChangeSet's
 * own `add` ops, so it reported "did this rule match at all" rather than "did
 * anything change": a rule proposing a tag an existing rule already supplied
 * read as full impact on every row, and an `edit`/`disable`/`remove` — the
 * ops where "what am I about to break?" matters most — read as zero
 * (POPS-2599).
 *
 * Running `suggestTags` rather than a local matcher is what keeps the preview
 * and the import pipeline from drifting: corrections, entity defaults and
 * every persisted rule are in both sides of the diff, and the match predicate
 * is by construction the one production uses. `recordTagRuleUsage: false`
 * keeps a preview from counting as a use of the rules it reads.
 *
 * `entityDefaultTags` is not available here (it comes from the contacts
 * pillar's per-run fetch, which the preview endpoint has no access to), so
 * the entity stage contributes nothing on either side — it cancels out of the
 * diff, and can only ever mask a rule tag identically in both.
 *
 * Counts are computed over every supplied transaction; only the `affected`
 * detail list is capped at `maxPreviewItems`. Totals taken after truncation
 * are the failure `previewRuleMatchTransactions` was written to avoid, and
 * silently capping "affects N transactions" at the page size is the same
 * failure with a different rule kind.
 *
 * `isNew` is answered by `loadKnownTagSet`, the same helper the suggester uses,
 * so this preview and the import wizard cannot disagree about whether a tag is
 * new — and the comparison is case-insensitive, so a tag differing from the
 * stored value only in case is not proposed as new (POPS-2602).
 *
 * The correction half of the suggester pass is fetched once here and threaded
 * through every `suggestOver` call — both the `before` and `after` pass over
 * every row — the same fetch-once shape `loadPersistedTagRules` already gives
 * the tag-rule half. Without it, a run over N transactions issued 2N
 * `findAllMatchingTransactionCorrections` queries: the tag-rule side was
 * already served from `persisted`/`merged`, but nothing capped the
 * corrections side the same way (POPS-2634).
 */
import { paginationMeta } from '../../shared/pagination.js';
import { suggestTags } from '../tag-suggester/index.js';
import { loadPersistedTagRules, mergeChangeSetOverRules } from './merged-rules.js';

import type { TagRuleChangeSet } from '../../../contract/rest-tag-rules.js';
import type { TransactionCorrectionRow } from '../../../db/index.js';
import type { InMemoryTagRule } from '../tag-suggester/tag-rule-matching.js';
import type {
  PreviewInputTransaction,
  TagRuleImpactItem,
  TagRulePreview,
  TagRulePreviewPage,
  TagSuggestion,
} from './types.js';

interface SuggestArgs {
  db: FinanceDb;
  transaction: PreviewInputTransaction;
  rules: readonly InMemoryTagRule[];
  corrections: readonly TransactionCorrectionRow[];
  knownTags: tagVocabularyService.KnownTagSet;
}

function suggestOver({
  db,
  transaction,
  rules,
  corrections,
  knownTags,
}: SuggestArgs): TagSuggestion[] {
  return suggestTags(db, {
    description: transaction.description,
    entityId: transaction.entityId ?? null,
    recordTagRuleUsage: false,
    tagRules: rules,
    corrections,
  }).map((s) => ({
    tag: s.tag,
    source: s.source,
    ...(s.pattern === undefined ? {} : { pattern: s.pattern }),
    isNew: !knownTags.has(s.tag),
  }));
}

interface RowDiff {
  added: string[];
  removed: string[];
}

function diffTags(before: TagSuggestion[], after: TagSuggestion[]): RowDiff {
  const beforeTags = new Set(before.map((s) => s.tag));
  const afterTags = new Set(after.map((s) => s.tag));
  return {
    added: [...afterTags].filter((tag) => !beforeTags.has(tag)),
    removed: [...beforeTags].filter((tag) => !afterTags.has(tag)),
  };
}

interface Accumulator {
  affected: TagRuleImpactItem[];
  affectedCount: number;
  suggestionChanges: number;
  removed: number;
  newTagProposals: number;
  newTags: Set<string>;
}

function record(acc: Accumulator, item: TagRuleImpactItem, diff: RowDiff): void {
  acc.affectedCount++;
  acc.suggestionChanges += diff.added.length + diff.removed.length;
  acc.removed += diff.removed.length;

  const addedSet = new Set(diff.added);
  for (const s of item.after.suggestedTags) {
    if (!s.isNew || !addedSet.has(s.tag)) continue;
    acc.newTagProposals++;
    acc.newTags.add(s.tag);
  }

  acc.affected.push(item);
}

/** Every affected row, uncapped — {@link previewTagRuleChangeSet}'s and the full-history mode's shared core. */
export interface TagRuleChangeSetDiff {
  counts: TagRulePreview['counts'];
  /** Every row whose suggestion set changed, in scan order — not yet paged. */
  affectedAll: TagRuleImpactItem[];
  newTags: string[];
}

/**
 * The suggestion impact of `changeSet` over `transactions`, uncapped.
 *
 * Rows carrying `userTags` are excluded: a tag rule is a suggestion and never
 * overrides a row the user has decided, so it has no impact there. Presence,
 * not length, is the test — a row edited down to no tags is still a decision.
 * The caller is responsible for sending that field only for edited rows;
 * without it, hand-tagged rows are reported as rule impact.
 *
 * Shared by {@link previewTagRuleChangeSet} (caller-list mode, capped at
 * `maxPreviewItems`) and the full-history scan mode (POPS-15, `limit`/`offset`
 * paged) — both page this same uncapped `affectedAll`, so the two modes
 * cannot disagree about which rows are affected, only about how much of the
 * list each returns.
 */
export function diffTagRuleChangeSet(
  db: FinanceDb,
  args: { changeSet: TagRuleChangeSet; transactions: PreviewInputTransaction[] }
): TagRuleChangeSetDiff {
  const knownTags = tagVocabularyService.loadKnownTagSet(db);
  const persisted = loadPersistedTagRules(db);
  const merged = mergeChangeSetOverRules(persisted, args.changeSet);
  const corrections = transactionCorrectionsService.listActiveTransactionCorrectionsForMatching(db);

  const acc: Accumulator = {
    affected: [],
    affectedCount: 0,
    suggestionChanges: 0,
    removed: 0,
    newTagProposals: 0,
    newTags: new Set(),
  };

  for (const transaction of args.transactions) {
    if (transaction.userTags !== undefined) continue;

    const before = suggestOver({ db, transaction, rules: persisted, corrections, knownTags });
    const after = suggestOver({ db, transaction, rules: merged, corrections, knownTags });
    const diff = diffTags(before, after);
    if (diff.added.length === 0 && diff.removed.length === 0) continue;

    record(
      acc,
      {
        transactionId: transaction.transactionId,
        description: transaction.description,
        before: { suggestedTags: before },
        after: { suggestedTags: after },
      },
      diff
    );
  }

  return {
    counts: {
      affected: acc.affectedCount,
      suggestionChanges: acc.suggestionChanges,
      removed: acc.removed,
      newTagProposals: acc.newTagProposals,
    },
    affectedAll: acc.affected,
    newTags: [...acc.newTags].toSorted((a, b) => a.localeCompare(b)),
  };
}

export function previewTagRuleChangeSet(
  db: FinanceDb,
  args: {
    changeSet: TagRuleChangeSet;
    transactions: PreviewInputTransaction[];
    maxPreviewItems: number;
  }
): TagRulePreview {
  const { counts, affectedAll, newTags } = diffTagRuleChangeSet(db, args);
  return { counts, affected: affectedAll.slice(0, args.maxPreviewItems), newTags };
}

/**
 * {@link previewTagRuleChangeSet}'s full-history mode (POPS-15): the same
 * diff, computed over every transaction in the finance DB rather than a
 * caller-supplied batch, with `affected` a true `limit`/`offset` window
 * instead of a from-the-top cap — mirroring `previewRuleMatchTransactions`'s
 * full-DB scan and `totalCount`.
 *
 * There is no `userTags` short-circuit here: that field exists for a caller
 * to say "I just edited this row and it should not be overwritten", which
 * has no counterpart for a DB row nobody has touched in this request.
 */
export function previewTagRuleChangeSetFullHistory(
  db: FinanceDb,
  args: { changeSet: TagRuleChangeSet; limit: number; offset: number }
): TagRulePreviewPage {
  const rows = transactionsService.listAllTransactionsForChangeSetPreview(db);
  const transactions: PreviewInputTransaction[] = rows.map((row) => ({
    transactionId: row.id,
    description: row.description,
    entityId: row.entityId,
  }));

  const { counts, affectedAll, newTags } = diffTagRuleChangeSet(db, {
    changeSet: args.changeSet,
    transactions,
  });

  return {
    counts,
    affected: affectedAll.slice(args.offset, args.offset + args.limit),
    newTags,
    pagination: paginationMeta(affectedAll.length, args.limit, args.offset),
  };
}
