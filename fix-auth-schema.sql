-- Fix for "Database error querying schema" issue
-- Based on: https://gist.github.com/khattaksd/4e8f4c89f4e928a2ecaad56d4a17ecd1

-- The issue is that RLS is enabled on auth.flow_state but there are no policies
-- This causes the auth service to fail when trying to query the schema

-- Connect as superuser and become the auth admin
\c postgres
SET ROLE supabase_admin;

-- Disable RLS on the flow_state table
-- This table is used internally by GoTrue and shouldn't have RLS
ALTER TABLE auth.flow_state OWNER TO supabase_auth_admin;
ALTER TABLE auth.flow_state DISABLE ROW LEVEL SECURITY;

-- Ensure proper permissions on auth schema
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;

-- Grant execution rights on auth functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO postgres, anon, authenticated, service_role;

-- Verify the fix
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'auth' AND tablename = 'flow_state';