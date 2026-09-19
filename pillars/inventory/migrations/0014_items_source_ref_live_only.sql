-- POPS-4053: a fan-out `sourceRef` is freed once its item is deleted, so a
-- later create naming the same slot mints a NEW item instead of colliding
-- with (or resurrecting) the tombstoned one. `items_code` stays a plain,
-- always-unique index by deliberate contrast (POPS-4124: a printed sticker
-- stays held by a deleted item); `source_ref` is an idempotency key with no
-- physical twin to stay bound to, so scoping it to live rows is the fix
-- rather than a compromise. The value is left on the tombstoned row for
-- provenance; only the constraint's reach changes.
DROP INDEX `items_source_ref`;--> statement-breakpoint
CREATE UNIQUE INDEX `items_source_ref` ON `items` (`source_ref`) WHERE `deleted_at` IS NULL;
