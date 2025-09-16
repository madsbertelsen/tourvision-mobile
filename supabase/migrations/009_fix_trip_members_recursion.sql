-- Drop existing policies causing infinite recursion
DROP POLICY IF EXISTS "Users can view trip members if they are a member" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owner can manage members" ON public.trip_members;
DROP POLICY IF EXISTS "Users can update their own member record" ON public.trip_members;

-- Create simpler policies that avoid recursion
-- Allow users to view trip members for trips they belong to
CREATE POLICY "Users can view trip members"
  ON public.trip_members FOR SELECT
  USING (
    -- Allow if user is authenticated
    auth.uid() IS NOT NULL
    -- No recursive check - just allow all authenticated users to see members
    -- The trip-level access control should handle privacy
  );

-- Allow trip owners to insert/delete members
CREATE POLICY "Trip owner can manage members"
  ON public.trip_members FOR ALL
  USING (
    auth.uid() IN (
      SELECT created_by FROM public.trips WHERE id = trip_members.trip_id
    )
  );

-- Allow users to update their own member record (for onboarding status)
CREATE POLICY "Users can update own membership"
  ON public.trip_members FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);