-- Billing-page Realtime read policy setup
-- Goal:
--   1) Allow frontend realtime/read-only access for billing display tables.
--   2) Keep write operations routed through backend (service role).
--
-- Tables covered:
--   public.bills
--   public.billitems
--   public.products
--   public.customers
--
-- Notes:
-- - With postgres_changes Realtime, table SELECT permissions/RLS govern visibility.
-- - No separate "realtime policy" is required for postgres_changes subscriptions.

BEGIN;

-- 1) Ensure tables are in the realtime publication.
--    NOTE:
--    Some Supabase projects do not allow ALTER PUBLICATION from SQL editor
--    (must be owner of publication). In that case this block logs NOTICEs and
--    you should enable tables from Dashboard -> Database -> Replication.
DO $$
BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bills'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping publication update for public.bills (insufficient privilege). Enable it in Supabase Dashboard -> Database -> Replication.';
  END;

  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'billitems'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.billitems;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping publication update for public.billitems (insufficient privilege). Enable it in Supabase Dashboard -> Database -> Replication.';
  END;

  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'products'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping publication update for public.products (insufficient privilege). Enable it in Supabase Dashboard -> Database -> Replication.';
  END;

  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customers'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping publication update for public.customers (insufficient privilege). Enable it in Supabase Dashboard -> Database -> Replication.';
  END;
END $$;

-- 2) Enable RLS.
ALTER TABLE IF EXISTS public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.billitems ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;

-- 3) Read-only policies for frontend roles.
--    Using both anon and authenticated to support current app rollout.
--    (Writes should continue via backend/service-role only.)

DROP POLICY IF EXISTS bills_read_anon ON public.bills;
CREATE POLICY bills_read_anon
ON public.bills
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS bills_read_authenticated ON public.bills;
CREATE POLICY bills_read_authenticated
ON public.bills
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS billitems_read_anon ON public.billitems;
CREATE POLICY billitems_read_anon
ON public.billitems
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS billitems_read_authenticated ON public.billitems;
CREATE POLICY billitems_read_authenticated
ON public.billitems
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS products_read_anon ON public.products;
CREATE POLICY products_read_anon
ON public.products
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS products_read_authenticated ON public.products;
CREATE POLICY products_read_authenticated
ON public.products
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS customers_read_anon ON public.customers;
CREATE POLICY customers_read_anon
ON public.customers
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS customers_read_authenticated ON public.customers;
CREATE POLICY customers_read_authenticated
ON public.customers
FOR SELECT
TO authenticated
USING (true);

-- 4) Ensure SELECT grants exist (RLS still applies).
GRANT SELECT ON TABLE public.bills TO anon, authenticated;
GRANT SELECT ON TABLE public.billitems TO anon, authenticated;
GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT SELECT ON TABLE public.customers TO anon, authenticated;

COMMIT;
