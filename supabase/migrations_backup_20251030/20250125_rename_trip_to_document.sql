-- Migration: Rename "trip" to "document" throughout the schema
-- This makes the platform generic for any collaborative use case

-- Step 1: Rename tables
ALTER TABLE IF EXISTS trip_chat_messages RENAME TO document_chat_messages;
ALTER TABLE IF EXISTS trip_share_link_uses RENAME TO document_share_link_uses;
ALTER TABLE IF EXISTS trip_share_links RENAME TO document_share_links;
ALTER TABLE IF EXISTS trip_shares RENAME TO document_shares;
ALTER TABLE IF EXISTS trip_invitations RENAME TO document_invitations;
ALTER TABLE IF EXISTS trip_places RENAME TO document_places;
ALTER TABLE IF EXISTS trip_members RENAME TO document_members;
ALTER TABLE IF EXISTS trips RENAME TO documents;

-- Step 2: Rename columns in renamed tables
-- Note: document_share_link_uses doesn't have trip_id, only share_link_id
ALTER TABLE document_chat_messages RENAME COLUMN trip_id TO document_id;
ALTER TABLE document_share_links RENAME COLUMN trip_id TO document_id;
ALTER TABLE document_shares RENAME COLUMN trip_id TO document_id;
ALTER TABLE document_invitations RENAME COLUMN trip_id TO document_id;
ALTER TABLE document_places RENAME COLUMN trip_id TO document_id;
ALTER TABLE document_members RENAME COLUMN trip_id TO document_id;

-- Step 3: Rename columns in other tables that reference trips
-- (Check proposals table if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'trip_id') THEN
        ALTER TABLE proposals RENAME COLUMN trip_id TO document_id;
    END IF;
END $$;

-- Step 4: Rename functions
DROP FUNCTION IF EXISTS get_trip_collaborators(UUID);
CREATE OR REPLACE FUNCTION get_document_collaborators(p_document_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  permission share_permission,
  is_owner BOOLEAN,
  shared_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  -- Get the owner
  SELECT
    d.created_by as user_id,
    u.email::text,
    p.full_name,
    'admin'::share_permission,
    true as is_owner,
    d.created_at as shared_at,
    d.created_at as accepted_at
  FROM documents d
  JOIN auth.users u ON u.id = d.created_by
  LEFT JOIN profiles p ON p.id = d.created_by
  WHERE d.id = p_document_id
  UNION ALL
  -- Get shared users
  SELECT
    ds.shared_with_user_id as user_id,
    u.email::text,
    p.full_name,
    ds.permission,
    false as is_owner,
    ds.created_at as shared_at,
    ds.accepted_at
  FROM document_shares ds
  JOIN auth.users u ON u.id = ds.shared_with_user_id
  LEFT JOIN profiles p ON p.id = ds.shared_with_user_id
  WHERE ds.document_id = p_document_id
  AND ds.accepted_at IS NOT NULL
  AND (ds.expires_at IS NULL OR ds.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Update RLS policies
-- Drop old policies for trips table
DROP POLICY IF EXISTS "Users can view own and shared trips" ON documents;
DROP POLICY IF EXISTS "Users can update own trips and shared trips with edit permission" ON documents;
DROP POLICY IF EXISTS "Users can insert own trips" ON documents;
DROP POLICY IF EXISTS "Users can delete own trips" ON documents;

-- Create new policies for documents table
CREATE POLICY "Users can view own and shared documents"
  ON documents FOR SELECT
  USING (
    -- User is the owner
    created_by = auth.uid()
    OR
    -- User has been granted access via document_shares
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = documents.id
      AND shared_with_user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

CREATE POLICY "Users can update own documents and shared documents with edit permission"
  ON documents FOR UPDATE
  USING (
    -- User is the owner
    created_by = auth.uid()
    OR
    -- User has edit permission via document_shares
    EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = documents.id
      AND shared_with_user_id = auth.uid()
      AND permission = 'edit'
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (created_by = auth.uid());

-- Update RLS policies for document_shares
DROP POLICY IF EXISTS "Users can view shares for their trips" ON document_shares;
DROP POLICY IF EXISTS "Trip owners can manage shares" ON document_shares;

CREATE POLICY "Users can view shares for their documents"
  ON document_shares FOR SELECT
  USING (
    -- User is the document owner
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
    OR
    -- User is the shared_with user
    shared_with_user_id = auth.uid()
  );

CREATE POLICY "Document owners can manage shares"
  ON document_shares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_shares.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Step 6: Update RLS policies for document_share_links
DROP POLICY IF EXISTS "Users can view share links for their trips" ON document_share_links;
DROP POLICY IF EXISTS "Users can create share links for their trips" ON document_share_links;
DROP POLICY IF EXISTS "Users can delete share links for their trips" ON document_share_links;

CREATE POLICY "Users can view share links for their documents"
  ON document_share_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_share_links.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create share links for their documents"
  ON document_share_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_share_links.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete share links for their documents"
  ON document_share_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_share_links.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Step 7: Update RLS policies for document_members
DROP POLICY IF EXISTS "Users can view members of trips they are part of" ON document_members;
DROP POLICY IF EXISTS "Trip owners can manage members" ON document_members;

CREATE POLICY "Users can view members of documents they are part of"
  ON document_members FOR SELECT
  USING (
    -- User is a member of the document
    user_id = auth.uid()
    OR
    -- User is the document owner
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_members.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Document owners can manage members"
  ON document_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_members.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Step 8: Update RLS policies for document_places
DROP POLICY IF EXISTS "Users can view places for trips they can access" ON document_places;
DROP POLICY IF EXISTS "Users can manage places for trips they own or edit" ON document_places;

CREATE POLICY "Users can view places for documents they can access"
  ON document_places FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_places.document_id
      AND (
        documents.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM document_shares
          WHERE document_shares.document_id = documents.id
          AND document_shares.shared_with_user_id = auth.uid()
          AND document_shares.accepted_at IS NOT NULL
          AND (document_shares.expires_at IS NULL OR document_shares.expires_at > NOW())
        )
      )
    )
  );

CREATE POLICY "Users can manage places for documents they own or edit"
  ON document_places FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_places.document_id
      AND (
        documents.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM document_shares
          WHERE document_shares.document_id = documents.id
          AND document_shares.shared_with_user_id = auth.uid()
          AND document_shares.permission = 'edit'
          AND document_shares.accepted_at IS NOT NULL
          AND (document_shares.expires_at IS NULL OR document_shares.expires_at > NOW())
        )
      )
    )
  );

-- Step 9: Update RLS policies for document_chat_messages
DROP POLICY IF EXISTS "Users can view chat messages for trips they can access" ON document_chat_messages;
DROP POLICY IF EXISTS "Users can insert chat messages for trips they can access" ON document_chat_messages;

CREATE POLICY "Users can view chat messages for documents they can access"
  ON document_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chat_messages.document_id
      AND (
        documents.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM document_shares
          WHERE document_shares.document_id = documents.id
          AND document_shares.shared_with_user_id = auth.uid()
          AND document_shares.accepted_at IS NOT NULL
          AND (document_shares.expires_at IS NULL OR document_shares.expires_at > NOW())
        )
      )
    )
  );

CREATE POLICY "Users can insert chat messages for documents they can access"
  ON document_chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chat_messages.document_id
      AND (
        documents.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM document_shares
          WHERE document_shares.document_id = documents.id
          AND document_shares.shared_with_user_id = auth.uid()
          AND document_shares.accepted_at IS NOT NULL
          AND (document_shares.expires_at IS NULL OR document_shares.expires_at > NOW())
        )
      )
    )
  );

-- Step 10: Update RPC function for share links (if it exists)
DROP FUNCTION IF EXISTS use_share_link(TEXT);
CREATE OR REPLACE FUNCTION use_share_link(p_share_code TEXT)
RETURNS TABLE (
  success BOOLEAN,
  error TEXT,
  document_id UUID,
  document_title TEXT,
  permission share_permission
) AS $$
DECLARE
  v_link RECORD;
  v_document RECORD;
  v_existing_share UUID;
BEGIN
  -- Find the share link
  SELECT * INTO v_link
  FROM document_share_links
  WHERE share_code = p_share_code
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (max_uses IS NULL OR uses_count < max_uses);

  IF v_link.id IS NULL THEN
    RETURN QUERY SELECT false, 'Invalid or expired share link'::TEXT, NULL::UUID, NULL::TEXT, NULL::share_permission;
    RETURN;
  END IF;

  -- Get document details
  SELECT * INTO v_document
  FROM documents
  WHERE id = v_link.document_id;

  IF v_document.id IS NULL THEN
    RETURN QUERY SELECT false, 'Document not found'::TEXT, NULL::UUID, NULL::TEXT, NULL::share_permission;
    RETURN;
  END IF;

  -- Check if user already has access
  SELECT id INTO v_existing_share
  FROM document_shares
  WHERE document_id = v_link.document_id
  AND shared_with_user_id = auth.uid();

  IF v_existing_share IS NULL THEN
    -- Create new share
    INSERT INTO document_shares (document_id, shared_with_user_id, shared_by_user_id, permission, accepted_at)
    VALUES (v_link.document_id, auth.uid(), v_link.created_by, v_link.permission, NOW());
  ELSE
    -- Update existing share
    UPDATE document_shares
    SET accepted_at = NOW(), permission = v_link.permission
    WHERE id = v_existing_share;
  END IF;

  -- Record the use
  INSERT INTO document_share_link_uses (share_link_id, used_by_user_id)
  VALUES (v_link.id, auth.uid());

  -- Increment use count
  UPDATE document_share_links
  SET uses_count = uses_count + 1
  WHERE id = v_link.id;

  -- Return success
  RETURN QUERY SELECT
    true,
    NULL::TEXT,
    v_document.id,
    v_document.title,
    v_link.permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Rename additional functions
DROP FUNCTION IF EXISTS user_has_trip_access(UUID, UUID, share_permission);
CREATE OR REPLACE FUNCTION user_has_document_access(
  p_document_id UUID,
  p_user_id UUID,
  p_min_permission share_permission DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user owns the document
  IF EXISTS (
    SELECT 1 FROM documents
    WHERE id = p_document_id AND created_by = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check if user has been shared the document with sufficient permission
  IF p_min_permission = 'view' THEN
    RETURN EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = p_document_id
      AND shared_with_user_id = p_user_id
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  ELSIF p_min_permission = 'edit' THEN
    RETURN EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = p_document_id
      AND shared_with_user_id = p_user_id
      AND permission IN ('edit', 'admin')
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  ELSIF p_min_permission = 'admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM document_shares
      WHERE document_id = p_document_id
      AND shared_with_user_id = p_user_id
      AND permission = 'admin'
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 12: Add comments for clarity
COMMENT ON TABLE documents IS 'Collaborative documents (formerly trips) - generic for any use case';
COMMENT ON TABLE document_shares IS 'Sharing permissions for documents';
COMMENT ON TABLE document_share_links IS 'Shareable links for documents';
COMMENT ON TABLE document_chat_messages IS 'Chat messages attached to documents';
COMMENT ON TABLE document_places IS 'Places/locations referenced in documents';
COMMENT ON TABLE document_members IS 'Members with access to documents';
COMMENT ON TABLE document_invitations IS 'Pending invitations to documents';
