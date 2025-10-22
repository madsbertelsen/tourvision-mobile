-- Trip sharing system
-- Allows users to share trips with others via invite links or direct invitations

-- Enum for share permissions
CREATE TYPE share_permission AS ENUM ('view', 'edit', 'admin');

-- Table for trip shares (direct user-to-user sharing)
CREATE TABLE trip_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT, -- For pending invites to non-users
  permission share_permission NOT NULL DEFAULT 'view',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  accepted_at TIMESTAMPTZ, -- When the share was accepted
  expires_at TIMESTAMPTZ, -- Optional expiration

  -- Ensure unique sharing per trip and user
  UNIQUE(trip_id, shared_with_user_id),
  UNIQUE(trip_id, shared_with_email)
);

-- Table for shareable links
CREATE TABLE trip_share_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_code TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 0, 9),
  permission share_permission NOT NULL DEFAULT 'view',
  max_uses INTEGER, -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,

  -- Index for quick lookup by share code
  CONSTRAINT share_code_unique UNIQUE(share_code)
);

-- Table to track who used share links
CREATE TABLE trip_share_link_uses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_link_id UUID NOT NULL REFERENCES trip_share_links(id) ON DELETE CASCADE,
  used_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Prevent same user from using link multiple times
  UNIQUE(share_link_id, used_by)
);

-- Add sharing metadata to trips table
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS sharing_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS default_share_permission share_permission DEFAULT 'view';

-- Create indexes for performance
CREATE INDEX idx_trip_shares_trip_id ON trip_shares(trip_id);
CREATE INDEX idx_trip_shares_shared_with_user_id ON trip_shares(shared_with_user_id);
CREATE INDEX idx_trip_shares_shared_with_email ON trip_shares(shared_with_email);
CREATE INDEX idx_trip_share_links_trip_id ON trip_share_links(trip_id);
CREATE INDEX idx_trip_share_links_share_code ON trip_share_links(share_code);
CREATE INDEX idx_trip_share_link_uses_share_link_id ON trip_share_link_uses(share_link_id);

-- RLS Policies

-- Enable RLS
ALTER TABLE trip_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_share_link_uses ENABLE ROW LEVEL SECURITY;

-- Trip shares policies
CREATE POLICY "Users can view shares for their trips or shares with them"
  ON trip_shares FOR SELECT
  USING (
    owner_id = auth.uid() OR
    shared_with_user_id = auth.uid() OR
    shared_with_email = auth.email()
  );

CREATE POLICY "Trip owners can create shares"
  ON trip_shares FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM trips
      WHERE id = trip_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Trip owners can update their shares"
  ON trip_shares FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Trip owners can delete their shares"
  ON trip_shares FOR DELETE
  USING (owner_id = auth.uid());

-- Share links policies
CREATE POLICY "Users can view their own share links"
  ON trip_share_links FOR SELECT
  USING (
    created_by = auth.uid() OR
    -- Allow viewing if user has access to the trip
    EXISTS (
      SELECT 1 FROM trips WHERE id = trip_id AND created_by = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM trip_shares
      WHERE trip_id = trip_share_links.trip_id
      AND shared_with_user_id = auth.uid()
    )
  );

CREATE POLICY "Trip owners can create share links"
  ON trip_share_links FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM trips
      WHERE id = trip_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Trip owners can update their share links"
  ON trip_share_links FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Trip owners can delete their share links"
  ON trip_share_links FOR DELETE
  USING (created_by = auth.uid());

-- Share link uses policies
CREATE POLICY "Users can view their own link uses"
  ON trip_share_link_uses FOR SELECT
  USING (used_by = auth.uid());

CREATE POLICY "Users can record their link use"
  ON trip_share_link_uses FOR INSERT
  WITH CHECK (used_by = auth.uid());

-- Function to check if a user has access to a trip
CREATE OR REPLACE FUNCTION user_has_trip_access(
  p_trip_id UUID,
  p_user_id UUID,
  p_min_permission share_permission DEFAULT 'view'
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user owns the trip
  IF EXISTS (
    SELECT 1 FROM trips
    WHERE id = p_trip_id AND created_by = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check if user has been shared the trip with sufficient permission
  IF p_min_permission = 'view' THEN
    RETURN EXISTS (
      SELECT 1 FROM trip_shares
      WHERE trip_id = p_trip_id
      AND shared_with_user_id = p_user_id
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  ELSIF p_min_permission = 'edit' THEN
    RETURN EXISTS (
      SELECT 1 FROM trip_shares
      WHERE trip_id = p_trip_id
      AND shared_with_user_id = p_user_id
      AND permission IN ('edit', 'admin')
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  ELSIF p_min_permission = 'admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM trip_shares
      WHERE trip_id = p_trip_id
      AND shared_with_user_id = p_user_id
      AND permission = 'admin'
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to use a share link
CREATE OR REPLACE FUNCTION use_share_link(p_share_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_link RECORD;
  v_trip RECORD;
  v_result JSON;
BEGIN
  -- Find the share link
  SELECT * INTO v_link
  FROM trip_share_links
  WHERE share_code = p_share_code
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (max_uses IS NULL OR current_uses < max_uses);

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid or expired share link'
    );
  END IF;

  -- Check if user already used this link
  IF EXISTS (
    SELECT 1 FROM trip_share_link_uses
    WHERE share_link_id = v_link.id
    AND used_by = auth.uid()
  ) THEN
    -- User already has access, just return the trip info
    SELECT * INTO v_trip FROM trips WHERE id = v_link.trip_id;
    RETURN json_build_object(
      'success', true,
      'trip_id', v_link.trip_id,
      'trip_title', v_trip.title,
      'permission', v_link.permission,
      'already_had_access', true
    );
  END IF;

  -- Record the link use
  INSERT INTO trip_share_link_uses (share_link_id, used_by)
  VALUES (v_link.id, auth.uid());

  -- Update link usage count
  UPDATE trip_share_links
  SET current_uses = current_uses + 1
  WHERE id = v_link.id;

  -- Create a trip share entry
  INSERT INTO trip_shares (
    trip_id,
    owner_id,
    shared_with_user_id,
    permission,
    accepted_at
  )
  VALUES (
    v_link.trip_id,
    v_link.created_by,
    auth.uid(),
    v_link.permission,
    NOW()
  )
  ON CONFLICT (trip_id, shared_with_user_id)
  DO UPDATE SET
    permission = EXCLUDED.permission,
    accepted_at = EXCLUDED.accepted_at;

  -- Get trip info
  SELECT * INTO v_trip FROM trips WHERE id = v_link.trip_id;

  RETURN json_build_object(
    'success', true,
    'trip_id', v_link.trip_id,
    'trip_title', v_trip.title,
    'permission', v_link.permission,
    'already_had_access', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all users with access to a trip
CREATE OR REPLACE FUNCTION get_trip_collaborators(p_trip_id UUID)
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
    t.created_by as user_id,
    u.email,
    p.full_name,
    'admin'::share_permission,
    true as is_owner,
    t.created_at as shared_at,
    t.created_at as accepted_at
  FROM trips t
  JOIN auth.users u ON u.id = t.created_by
  LEFT JOIN profiles p ON p.id = t.created_by
  WHERE t.id = p_trip_id

  UNION ALL

  -- Get shared users
  SELECT
    ts.shared_with_user_id as user_id,
    u.email,
    p.full_name,
    ts.permission,
    false as is_owner,
    ts.created_at as shared_at,
    ts.accepted_at
  FROM trip_shares ts
  JOIN auth.users u ON u.id = ts.shared_with_user_id
  LEFT JOIN profiles p ON p.id = ts.shared_with_user_id
  WHERE ts.trip_id = p_trip_id
  AND ts.accepted_at IS NOT NULL
  AND (ts.expires_at IS NULL OR ts.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;