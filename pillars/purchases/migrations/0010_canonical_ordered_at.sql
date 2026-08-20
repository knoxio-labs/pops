-- Data only. No column is added, dropped or altered here.
--
-- `purchases.ordered_at` is TEXT and every comparison the pillar makes on it
-- is lexicographic — the date windows, the `ORDER BY ordered_at DESC` the
-- index and the queue read through, the equality the shop-moment dedup turns
-- on. That only means chronological order while every row is spelled the
-- same way, and the write path now guarantees exactly one spelling
-- (`src/db/services/ordered-at.ts`). This brings the rows that were written
-- before it into that spelling, because a canonicalising writer over a
-- heterogeneous table fixes nothing.
--
-- `strftime('%Y-%m-%dT%H:%M:%fZ', …)` is the same form `toISOString()`
-- produces and the same form the `created_at` / `updated_at` defaults on this
-- table already carry, so a row an adapter wrote is rewritten to itself. A
-- test holds the two to the same answer on the spellings the old writer
-- could store — an offset resolved to UTC, a missing fraction padded to
-- `.000` — and pins the one place they part: below a millisecond SQLite
-- rounds where `toISOString()` truncates, so the two land a millisecond
-- apart on a column whose windows are days wide.
--
-- The NULL guard is what makes this safe rather than destructive: a value
-- SQLite cannot read is left exactly as it was. Without it the column is
-- NOT NULL and the statement would abort, taking the whole migration batch —
-- and every migration after it — with it.
--
-- No cutover timestamp is needed. The migrator runs inside
-- `openPurchasesDb` before the process serves anything and is hash-tracked,
-- so every row this statement can see is by construction one the old writer
-- wrote, and a fresh deployment gets a no-op.
UPDATE `purchases`
SET `ordered_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `ordered_at`)
WHERE strftime('%Y-%m-%dT%H:%M:%fZ', `ordered_at`) IS NOT NULL
  AND `ordered_at` <> strftime('%Y-%m-%dT%H:%M:%fZ', `ordered_at`);
