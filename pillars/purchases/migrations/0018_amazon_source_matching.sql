-- Data only. No column is added, dropped or altered here.
--
-- The `amazon` source row is written by the ingest CLI, so these values
-- mirror `src/ingest/amazon/source-settings.ts`; a database that already
-- holds the row keeps the old ones until the next ingest otherwise.
--
-- POPS-4650: `AMAZON%` also matched `AMAZON WEB SERVICES`. Every Amazon
-- retail descriptor carries `AU` and the AWS one does not.
--
-- POPS-4647: the window narrows from the 21-day default to 10, alongside the
-- sweep's card filter.
--
-- Each statement only replaces the value the CLI used to write, so a row an
-- operator has tuned by hand is left alone.
UPDATE `purchase_sources`
SET `descriptor_pattern` = 'AMAZON%AU%'
WHERE `id` = 'amazon' AND `descriptor_pattern` = 'AMAZON%';--> statement-breakpoint
UPDATE `purchase_sources`
SET `settlement_window_days` = 10
WHERE `id` = 'amazon' AND `settlement_window_days` = 21;
