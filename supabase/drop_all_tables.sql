-- Drop ALL tables in public schema (excluding vector extension)
-- Run this in Supabase SQL Editor

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all tables in public schema
    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- Reset migration history
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'supabase_migrations'
        AND tablename = 'schema_migrations'
    ) THEN
        TRUNCATE supabase_migrations.schema_migrations;
    END IF;
END $$;

-- Show success
SELECT 'All tables dropped. Migration history cleared. Run: npx supabase db push' as message;
