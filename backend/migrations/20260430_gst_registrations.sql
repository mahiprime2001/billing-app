-- Migration: introduce gst_registrations table and link each store to one GST.
-- Background: the business is expanding into a second state. The single
-- systemsettings.gstin can no longer be used for every store; each store
-- prints the GSTIN of the state it operates in.

BEGIN;

-- 1. New table: one row per (gst_number, state) registration.
CREATE TABLE IF NOT EXISTS public.gst_registrations (
    id           character varying NOT NULL,
    gst_number   character varying NOT NULL UNIQUE,
    state        character varying NOT NULL,
    created_at   timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT gst_registrations_pkey PRIMARY KEY (id)
);

-- 2. Add the FK column to stores. Nullable for now so we can backfill before
--    flipping to NOT NULL.
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS gst_registration_id character varying;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'stores_gst_registration_fk'
          AND table_name = 'stores'
    ) THEN
        ALTER TABLE public.stores
            ADD CONSTRAINT stores_gst_registration_fk
            FOREIGN KEY (gst_registration_id)
            REFERENCES public.gst_registrations(id);
    END IF;
END $$;

-- 3. Seed the new table from the existing single GSTIN, if any.
INSERT INTO public.gst_registrations (id, gst_number, state)
SELECT 'gst-seed', s.gstin, 'TBD'
FROM public.systemsettings s
WHERE s.gstin IS NOT NULL AND s.gstin <> ''
ORDER BY s.id
LIMIT 1
ON CONFLICT (gst_number) DO NOTHING;

-- 4. Backfill every existing store with the seeded GST so the NOT NULL flip
--    below is safe. Admin can reassign each store individually afterwards.
UPDATE public.stores
SET gst_registration_id = 'gst-seed'
WHERE gst_registration_id IS NULL
  AND EXISTS (SELECT 1 FROM public.gst_registrations WHERE id = 'gst-seed');

-- 5. Enforce that every store has a GST.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.stores WHERE gst_registration_id IS NULL) THEN
        RAISE NOTICE 'Some stores have no gst_registration_id; not flipping NOT NULL. Assign them in admin first.';
    ELSE
        ALTER TABLE public.stores
            ALTER COLUMN gst_registration_id SET NOT NULL;
    END IF;
END $$;

COMMIT;
