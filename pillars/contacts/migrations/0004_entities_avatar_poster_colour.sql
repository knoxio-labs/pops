-- Add avatar/poster asset references and a display colour to `entities`.
--
-- `avatar_asset_id` / `poster_asset_id` point at rows in the `blobs` table
-- (added by the next migration) — nullable, no FK: the blobs table doesn't
-- exist yet when this file runs relative to a fresh database applying the
-- whole journal in order, and sqlite FKs are declared at table-create time
-- only. `colour` is a nullable hex string (e.g. `#3B82F6`), validated at the
-- route boundary like `type`.
ALTER TABLE entities ADD COLUMN avatar_asset_id TEXT;
ALTER TABLE entities ADD COLUMN poster_asset_id TEXT;
ALTER TABLE entities ADD COLUMN colour TEXT;
