-- Fix RLS infinite recursion on documents table
-- Problem: Policies on documents table reference document_shares,
-- and policies on document_shares reference documents, creating infinite recursion
--
-- Solution: Drop policies that reference other tables and keep simple policies

-- Drop duplicate/problematic policies on documents table
DROP POLICY IF EXISTS "Users can view own and shared documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update own documents and shared documents with edit p" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;

-- Drop problematic policies on document_shares table that reference documents
DROP POLICY IF EXISTS "Document owners can manage shares" ON public.document_shares;
DROP POLICY IF EXISTS "Trip owners can create shares" ON public.document_shares;
DROP POLICY IF EXISTS "Users can view shares for their documents" ON public.document_shares;

-- Keep only the simple, non-recursive policies that were working:
-- trips_select_policy, trips_insert_policy, trips_update_policy, trips_delete_policy
-- These remaining policies are safe because they don't reference other tables
