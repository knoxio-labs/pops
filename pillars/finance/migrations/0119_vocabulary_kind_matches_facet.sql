-- POPS-3744: give every faceted vocabulary row the kind its facet has.
--
-- `kind` is policy keyed by facet name, owned by `TAG_FACET_KINDS` in
-- `src/db/tag-facets.ts`. Three prod rows disagreed with it:
-- `contains:car-rental`, `contains:haircut` and `contains:streaming` were
-- `closed` on an `open` facet. 0079 opened `contains` by facet, so these rows
-- got their `closed` kind some other way after it ran. 0106 then seeded them as
-- `open`, but its `INSERT OR IGNORE` skipped them because they already existed.
-- A database built from the chain and the live one therefore disagreed, and
-- nothing at runtime corrects an existing row: the import commit only upserts
-- tags the vocabulary does not already hold.
--
-- The CASE below spells out the whole map rather than only `contains`, so any
-- other row that drifted the same way is corrected too. It must list exactly
-- the facets in `TAG_FACET_KINDS`; `tag-vocabulary-kind-invariant.test.ts` and
-- the 0119 migration test fail if the two disagree.
--
-- A row whose facet is NULL or not in the map is left alone. The CASE has no
-- ELSE, so it yields NULL for those rows and the row is skipped. `tagFacetKind`
-- defaults such a facet to `open`, but that default is a runtime answer about
-- an unvetted tag, not a policy this migration should write onto a legacy row.
--
-- Idempotent: a row is written only where its kind differs from the map, so a
-- second run matches nothing.
-- REQUIRED before running against a real database: take a snapshot first
-- (finance-audit remediation policy). Rollback = restore the snapshot.

UPDATE `tag_vocabulary`
SET `kind` = `expected`.`kind`
FROM (
  SELECT
    `tag`,
    CASE `facet`
      WHEN 'venue' THEN 'closed'
      WHEN 'occasion' THEN 'closed'
      WHEN 'contains' THEN 'open'
      WHEN 'channel' THEN 'closed'
      WHEN 'fee' THEN 'closed'
      WHEN 'trip' THEN 'open'
      WHEN 'asset' THEN 'open'
      WHEN 'project' THEN 'open'
      WHEN 'hobby' THEN 'open'
      WHEN 'tax' THEN 'open'
      WHEN 'enrich' THEN 'open'
      WHEN 'person' THEN 'marker'
      WHEN 'flag' THEN 'marker'
    END AS `kind`
  FROM `tag_vocabulary`
) AS `expected`
WHERE `expected`.`tag` = `tag_vocabulary`.`tag`
  AND `expected`.`kind` IS NOT NULL
  AND `tag_vocabulary`.`kind` <> `expected`.`kind`;
