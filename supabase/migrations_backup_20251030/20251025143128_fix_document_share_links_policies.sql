-- Fix document_share_links RLS policies to prevent recursion
-- Add missing UPDATE policy and simplify to avoid recursive checks

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view share links for their documents" ON document_share_links;
DROP POLICY IF EXISTS "Users can create share links for their documents" ON document_share_links;
DROP POLICY IF EXISTS "Users can update share links for their documents" ON document_share_links;
DROP POLICY IF EXISTS "Users can delete share links for their documents" ON document_share_links;

-- Simpler policies that directly check created_by without querying documents table
-- This avoids potential recursion issues
CREATE POLICY "Users can view share links for their documents"
  ON document_share_links FOR SELECT
  USING (
    created_by = auth.uid()
  );

CREATE POLICY "Users can create share links for their documents"
  ON document_share_links FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
  );

CREATE POLICY "Users can update share links for their documents"
  ON document_share_links FOR UPDATE
  USING (
    created_by = auth.uid()
  );

CREATE POLICY "Users can delete share links for their documents"
  ON document_share_links FOR DELETE
  USING (
    created_by = auth.uid()
  );
