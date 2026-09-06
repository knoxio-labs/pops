-- POPS-3045. Restore ANZ credit-card CSV checksums to the identity used at import.
--
-- ANZ's headerless credit-card export carries the whole payment narrative in
-- `Description`. The importer deliberately hashes that raw value: its padded
-- detail is the only field that distinguishes two same-day, same-amount ANZ
-- purchases at different branches. It stores a parsed merchant description
-- instead, so `0089_scope_dedup_key_to_account_id` accidentally re-keyed these
-- rows from the shortened stored value. Re-importing their source CSV could
-- therefore not find the existing checksum and would offer duplicate rows.
--
-- Headerless ANZ rows alone carry every synthetic unused column. This condition
-- excludes headed CSV dialects such as Amex, whose stored and raw descriptions
-- are already identical. Rebuild only those rows from their original raw
-- description, retaining the same date, amount, account id, and reference
-- extraction as the canonical key builder.
UPDATE `transactions`
SET `checksum` = finance_account_id_scoped_checksum(
  `date`,
  `amount_cents`,
  json_extract(`raw_row`, '$.Description'),
  `raw_row`,
  `account_id`
)
WHERE `checksum` IS NOT NULL
  AND json_type(CASE WHEN json_valid(`raw_row`) THEN `raw_row` ELSE '{}' END, '$.Description') = 'text'
  AND json_type(CASE WHEN json_valid(`raw_row`) THEN `raw_row` ELSE '{}' END, '$."Column 4"') IS NOT NULL
  AND json_type(CASE WHEN json_valid(`raw_row`) THEN `raw_row` ELSE '{}' END, '$."Column 5"') IS NOT NULL
  AND json_type(CASE WHEN json_valid(`raw_row`) THEN `raw_row` ELSE '{}' END, '$."Column 6"') IS NOT NULL
  AND json_type(CASE WHEN json_valid(`raw_row`) THEN `raw_row` ELSE '{}' END, '$."Column 7"') IS NOT NULL
  AND json_type(CASE WHEN json_valid(`raw_row`) THEN `raw_row` ELSE '{}' END, '$."Column 8"') IS NOT NULL;
