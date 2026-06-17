-- One-time migration: move OLD pending store_damage_returns rows into the new
-- returns flow as ALREADY-VERIFIED orders held "with admin".
--
-- Why "already verified": these rows already had their stock removed when they
-- were originally created (old flow). Bringing them in as verified/with-admin
-- means NO stock change now, and they appear in Returns -> With Admin, ready to
-- Send to a store. (Verifying them again would wrongly remove stock twice.)
--
-- Grouping: one return order per store.
-- Scope: pending, NON-damaged rows (low_sales / modification / other).
--        Damaged rows stay on the Damage page.
-- Safe to run once. Re-running is a no-op (migrated rows are excluded).

BEGIN;

WITH eligible AS (
  SELECT *
  FROM public.store_damage_returns
  WHERE status NOT IN ('fixed','discarded','sent_to_store','repaired','modified','returned_to_store','migrated')
    AND reason_type IN ('low_sales','modification','other')
),
stores_to_migrate AS (
  SELECT store_id,
         MIN(created_by) AS created_by,
         SUM(quantity)::int AS total_qty
  FROM eligible
  GROUP BY store_id
),
new_orders AS (
  INSERT INTO public.returns
    (return_id, store_id, created_by, return_type, admin_status, return_quantity, created_at, updated_at)
  SELECT 'RET-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
         s.store_id, s.created_by, 'store_to_admin', 'verified', s.total_qty, now(), now()
  FROM stores_to_migrate s
  RETURNING return_id, store_id
)
INSERT INTO public.return_products
  (id, return_id, product_id, quantity, reason, reason_type,
   verified_qty, verify_status, verified_at, holding_status, notes, created_at, updated_at)
SELECT 'RP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
       o.return_id, e.product_id, e.quantity, e.reason, e.reason_type,
       e.quantity, 'verified', now(), 'with_admin',
       'Migrated from damage ' || e.id, e.created_at, now()
FROM eligible e
JOIN new_orders o ON o.store_id = e.store_id;

-- Mark the old rows migrated so they leave the Damage page (kept for history).
UPDATE public.store_damage_returns
SET status = 'migrated', resolution_status = 'migrated', updated_at = now()
WHERE status NOT IN ('fixed','discarded','sent_to_store','repaired','modified','returned_to_store','migrated')
  AND reason_type IN ('low_sales','modification','other');

COMMIT;
