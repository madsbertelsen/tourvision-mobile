-- Simple reset - just drop our custom tables
-- Run this in Supabase SQL Editor

-- Drop all custom tables (ignore errors if they don't exist)
DROP TABLE IF EXISTS public.yjs_documents CASCADE;
DROP TABLE IF EXISTS public.trip_invites CASCADE;
DROP TABLE IF EXISTS public.collaboration_sessions CASCADE;
DROP TABLE IF EXISTS public.map_tiles CASCADE;
DROP TABLE IF EXISTS public.ai_suggestions CASCADE;
DROP TABLE IF EXISTS public.trip_chat_messages CASCADE;
DROP TABLE IF EXISTS public.proposal_votes CASCADE;
DROP TABLE IF EXISTS public.proposals CASCADE;
DROP TABLE IF EXISTS public.trip_members CASCADE;
DROP TABLE IF EXISTS public.trip_places CASCADE;
DROP TABLE IF EXISTS public.places CASCADE;
DROP TABLE IF EXISTS public.trips CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Reset migration history
TRUNCATE supabase_migrations.schema_migrations;

-- Done
SELECT 'Database reset complete. Now run: npx supabase db push' as message;
