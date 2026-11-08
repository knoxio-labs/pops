-- When a live draft's reported balance was read. Without it the commit dated
-- the balance to the newest row's day, and a reading taken mid-afternoon was
-- recorded as that day's close even though more rows followed it.
ALTER TABLE `import_drafts` ADD `balance_reported_at` text;
