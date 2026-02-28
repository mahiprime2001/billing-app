-- Store damaged-return lifecycle table

CREATE TABLE IF NOT EXISTS public.store_damage_returns (
  id character varying PRIMARY KEY,
  store_id character varying NOT NULL REFERENCES public.stores(id),
  product_id character varying NOT NULL REFERENCES public.products(id),
  quantity integer NOT NULL DEFAULT 0,
  reason text,
  damage_origin character varying DEFAULT 'store',
  status character varying DEFAULT 'sent_to_admin',
  notes text,
  created_by character varying REFERENCES public.users(id),
  repaired_by character varying REFERENCES public.users(id),
  repaired_qty integer DEFAULT 0,
  repair_notes text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  repaired_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_store_damage_returns_store_status
  ON public.store_damage_returns (store_id, status);

CREATE INDEX IF NOT EXISTS idx_store_damage_returns_product
  ON public.store_damage_returns (product_id);

