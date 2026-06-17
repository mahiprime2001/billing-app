-- Track where a held return item was sent (for the Returns "Sent Out" tab:
-- Sent From = the store that returned it; Sent To = this destination).
-- Run once. Safe to re-run.

ALTER TABLE public.return_products
  ADD COLUMN IF NOT EXISTS sent_to_store_id character varying;
ALTER TABLE public.return_products
  ADD COLUMN IF NOT EXISTS sent_at timestamp without time zone;
