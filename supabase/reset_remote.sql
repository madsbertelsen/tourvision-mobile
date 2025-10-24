-- Reset Remote Supabase Database
-- Run this in Supabase SQL Editor before pushing migrations

-- Drop all tables in public schema (except vector extension tables)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all custom tables (not system/extension tables)
    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;

    -- Drop all custom functions (not from extensions)
    FOR r IN (
        SELECT proname, oidvectortypes(proargtypes) as argtypes
        FROM pg_proc
        INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE pg_namespace.nspname = 'public'
        AND pg_proc.prokind = 'f'
        AND NOT EXISTS (
            SELECT 1 FROM pg_depend
            WHERE pg_depend.objid = pg_proc.oid
            AND pg_depend.deptype = 'e'
        )
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE';
    END LOOP;
END $$;

-- Reset migration history if it exists
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

-- Success message
SELECT 'Database reset complete. Run: npx supabase db push' as status;
