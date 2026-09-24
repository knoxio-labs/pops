-- Data only. No column is added, dropped or altered here.
--
-- POPS-4612: nothing ever recomputed `purchases.status` from
-- `purchase_charge_links` — the reconcile sweep and the confirm/reject/
-- unlink handlers wrote links but never touched status, so every order
-- shipped sat at whatever it was created with (`awaiting_settlement` unless
-- paid cash). The write paths are fixed in application code; this brings
-- every order already on disk into agreement with the same rule, once.
--
-- The rule, mirroring `src/db/services/purchase-status.ts`'s `deriveStatus`:
--   `awaiting_settlement`  no `capture`/`adjustment` charge carries a link
--   `linked`               those charges' linked total covers the order's
--                           total in full (or more — an over-match still
--                           counts as covered)
--   `partial`               it covers some but not all of the total
--   `settled_cash`, `ignored`   left exactly as they are; neither is
--                           derived from links, and both are excluded from
--                           the `matched` CTE's window by the WHERE clause
--                           below rather than by a CASE branch, so a status
--                           this migration must never touch is never even
--                           computed for.
--
-- `refund` and `authorization` charges are excluded from `matched`, the
-- same exclusion `computeAccounting` already applies: a refund is money
-- that came back, not money that paid for the order, and an authorization
-- is a hold rather than a settlement.
--
-- Idempotent by construction: `matched` is read fresh from the current
-- state of `purchase_charges`/`purchase_charge_links` every time this runs,
-- and the final WHERE only touches rows whose derived status differs from
-- what is stored, so a second run (impossible in practice — the migrator is
-- hash-tracked and applies each file once) would update zero rows.
WITH matched AS (
  SELECT
    pc.purchase_id AS purchase_id,
    SUM(pc.order_amount_cents) AS matched_cents
  FROM purchase_charges pc
  WHERE pc.role IN ('capture', 'adjustment')
    AND EXISTS (
      SELECT 1 FROM purchase_charge_links pcl WHERE pcl.charge_id = pc.id
    )
  GROUP BY pc.purchase_id
),
derived AS (
  SELECT
    p.id AS purchase_id,
    CASE
      WHEN COALESCE(m.matched_cents, 0) <= 0 THEN 'awaiting_settlement'
      WHEN COALESCE(m.matched_cents, 0) >= p.total_cents THEN 'linked'
      ELSE 'partial'
    END AS new_status
  FROM purchases p
  LEFT JOIN matched m ON m.purchase_id = p.id
  WHERE p.status NOT IN ('settled_cash', 'ignored')
)
UPDATE purchases
SET
  status = (SELECT new_status FROM derived WHERE derived.purchase_id = purchases.id),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE purchases.id IN (
  SELECT purchase_id FROM derived WHERE derived.new_status <> purchases.status
);
