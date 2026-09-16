-- POPS-3681: recount `usage_count` on every vocabulary row from the rows that
-- actually carry the tag.
--
-- `usage_count` is meant to be `applyVocabularyUsageDelta`'s running total, but
-- every migration that rewrites `transactions.tags` has had to keep it in step
-- by hand — 0102 recomputes it for the `fee:` values it retypes, 0107
-- decrements `occasion:home` by the rows it strips. A hand-kept counter drifts
-- the moment one caller of the write path forgets to touch it, and there is no
-- way to tell a drifted count from a correct one by looking at the column
-- alone. This migration is the correction: derive every row's count directly
-- from `transactions` rather than trust whatever arithmetic produced it.
--
-- `COUNT(DISTINCT r.id)`, not `COUNT(*)`: a transaction that carries the same
-- tag twice — malformed input, or a merge that did not dedupe — must count
-- once, matching `applyVocabularyUsageDelta`'s `Set`-based accounting
-- (`src/db/services/tag-vocabulary.ts`). `json_each` on such a row yields the
-- tag twice, so a plain `COUNT(*)` here would overcount it and disagree with
-- the code path that maintains the column incrementally.
--
-- Every row, not only `venue`/`fee`: this is a general correction, not
-- targeted at the two new POPS-3680 values, so it is written to hold for the
-- whole table rather than a `WHERE tag LIKE ...` filter that would need
-- revisiting the next time a count drifts.
--
-- Idempotent: the value is recomputed, not adjusted, so a second run derives
-- the same number from the same `transactions` table and writes nothing new.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `tag_vocabulary`
SET `usage_count` = (
	SELECT COUNT(DISTINCT r.id) FROM `transactions` r, json_each(r.`tags`) je
	 WHERE je.value = `tag_vocabulary`.`tag`
);
