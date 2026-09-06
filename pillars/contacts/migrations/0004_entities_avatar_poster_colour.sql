-- Add avatar/poster asset references and a display colour to `entities`.
--
-- `avatar_asset_id` / `poster_asset_id` point at rows in the `blobs` table
-- (added by the next migration) — nullable, no FK: the blobs table doesn't
-- exist yet when this file runs relative to a fresh database applying the
-- whole journal in order, and sqlite FKs are declared at table-create time
-- only. `colour` is a nullable text column holding one id from the fixed
-- palette in `entities::colours` (POPS-3061 design correction) — assigned at
-- random on create and changed only by a dedicated reroll, never a freeform
-- client-supplied value.
ALTER TABLE entities ADD COLUMN avatar_asset_id TEXT;
ALTER TABLE entities ADD COLUMN poster_asset_id TEXT;
ALTER TABLE entities ADD COLUMN colour TEXT;
