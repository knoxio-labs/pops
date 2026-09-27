WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY position, id) - 1 AS next_position
  FROM item_photos
)
UPDATE item_photos
SET position = (SELECT next_position FROM ranked WHERE ranked.id = item_photos.id)
WHERE id IN (SELECT id FROM ranked);
