-- What the device and the photograph said about themselves.
--
-- A receipt photographed at the till carries two facts the paper never
-- states: when the shutter fired, and where the phone was standing. Both
-- were discarded — the drop-zone inferred a timezone from a printed address
-- and dated an undated receipt from the moment its bytes arrived.
--
-- Its own table rather than columns on `purchases`, because the coordinates
-- are the most sensitive thing this pillar stores. A column on the order row
-- is a column every SELECT over an order carries into every serializer and
-- every future read path; a separate table has to be joined deliberately,
-- which is what keeps a location out of a response nobody meant to put it
-- in. No read path joins it today.
--
-- One row per order: several photographs of one long receipt are one
-- capture event. Every column is nullable because every one of them is
-- ordinarily absent — phones strip EXIF on share, screenshots never had
-- any, and a browser drop-zone sends no capture block at all.
--
-- Nothing is backfilled and nothing could be. The uploads already on disk
-- still carry whatever EXIF they arrived with, but the purchases built from
-- them have dates and zones a re-read would move, and silently re-dating a
-- reconciled order to improve its provenance is not a migration's business.
CREATE TABLE `purchase_capture` (
	`purchase_id` text PRIMARY KEY NOT NULL,
	`captured_at` text,
	`captured_at_source` text,
	`utc_offset_minutes` integer,
	`declared_time_zone` text,
	`latitude` real,
	`longitude` real,
	`location_source` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_purchase_capture_captured_at_source" CHECK("purchase_capture"."captured_at_source" IS NULL OR "purchase_capture"."captured_at_source" IN ('client','exif')),
	CONSTRAINT "ck_purchase_capture_location_source" CHECK("purchase_capture"."location_source" IS NULL OR "purchase_capture"."location_source" IN ('client','exif')),
	-- A coordinate outside the globe is a parse that went wrong, and half a
	-- coordinate is not a place: both are refused here as well as in the
	-- reader, because the CHECK is what holds for a writer that has not been
	-- written yet.
	CONSTRAINT "ck_purchase_capture_latitude" CHECK("purchase_capture"."latitude" IS NULL OR ("purchase_capture"."latitude" >= -90 AND "purchase_capture"."latitude" <= 90)),
	CONSTRAINT "ck_purchase_capture_longitude" CHECK("purchase_capture"."longitude" IS NULL OR ("purchase_capture"."longitude" >= -180 AND "purchase_capture"."longitude" <= 180)),
	CONSTRAINT "ck_purchase_capture_location_pair" CHECK(("purchase_capture"."latitude" IS NULL) = ("purchase_capture"."longitude" IS NULL)),
	-- ±14:00 is the widest offset any zone has ever used. A larger figure is
	-- a garbled EXIF field or a client sending nonsense, and applying it
	-- moves a purchase across a day boundary.
	CONSTRAINT "ck_purchase_capture_utc_offset" CHECK("purchase_capture"."utc_offset_minutes" IS NULL OR ("purchase_capture"."utc_offset_minutes" >= -840 AND "purchase_capture"."utc_offset_minutes" <= 840))
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_capture_captured_at` ON `purchase_capture` (`captured_at`);
