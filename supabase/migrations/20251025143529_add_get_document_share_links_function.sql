-- Create security definer function to get share links
-- This bypasses RLS checks and prevents recursion

CREATE OR REPLACE FUNCTION get_document_share_links(p_document_id UUID)
RETURNS TABLE (
  id UUID,
  share_code TEXT,
  permission share_permission,
  max_uses INTEGER,
  current_uses INTEGER,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  created_by UUID
) 
SECURITY DEFINER
AS $$
BEGIN
  -- First check if the user owns the document
  IF NOT EXISTS (
    SELECT 1 FROM documents 
    WHERE documents.id = p_document_id 
    AND documents.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You must own this document to view share links';
  END IF;

  -- Return share links for the document
  RETURN QUERY
  SELECT 
    dsl.id,
    dsl.share_code,
    dsl.permission,
    dsl.max_uses,
    dsl.uses_count as current_uses,
    dsl.expires_at,
    dsl.is_active,
    dsl.created_at,
    dsl.created_by
  FROM document_share_links dsl
  WHERE dsl.document_id = p_document_id
  AND dsl.is_active = true
  ORDER BY dsl.created_at DESC;
END;
$$ LANGUAGE plpgsql;
