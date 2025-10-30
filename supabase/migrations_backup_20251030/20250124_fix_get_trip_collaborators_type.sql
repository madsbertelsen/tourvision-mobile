-- Fix type mismatch in get_trip_collaborators function
-- auth.users.email is varchar(255) but function returns TEXT
-- We need to cast it explicitly

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
    u.email::text,  -- Cast varchar to text
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
    u.email::text,  -- Cast varchar to text
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
