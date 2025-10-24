-- Update trips RLS policies to allow access to shared trips

-- Drop existing SELECT policy if it exists
DROP POLICY IF EXISTS "Users can view their own trips" ON trips;
DROP POLICY IF EXISTS "Users can view trips" ON trips;
DROP POLICY IF EXISTS "Enable read access for own trips" ON trips;

-- Create new SELECT policy that includes shared trips
CREATE POLICY "Users can view own and shared trips"
  ON trips FOR SELECT
  USING (
    -- User is the owner
    created_by = auth.uid()
    OR
    -- User has been granted access via trip_shares
    EXISTS (
      SELECT 1 FROM trip_shares
      WHERE trip_id = trips.id
      AND shared_with_user_id = auth.uid()
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Update UPDATE policy to allow shared users with edit permission to update trips
DROP POLICY IF EXISTS "Users can update their own trips" ON trips;
DROP POLICY IF EXISTS "Users can update trips" ON trips;
DROP POLICY IF EXISTS "Enable update for own trips" ON trips;

CREATE POLICY "Users can update own trips and shared trips with edit permission"
  ON trips FOR UPDATE
  USING (
    -- User is the owner
    created_by = auth.uid()
    OR
    -- User has edit permission via trip_shares
    EXISTS (
      SELECT 1 FROM trip_shares
      WHERE trip_id = trips.id
      AND shared_with_user_id = auth.uid()
      AND permission = 'edit'
      AND accepted_at IS NOT NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );
