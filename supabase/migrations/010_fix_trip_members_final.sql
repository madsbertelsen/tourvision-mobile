-- Drop ALL existing policies on trip_members to fix infinite recursion
DROP POLICY IF EXISTS "Members can view trip membership" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owner can manage members" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can manage members" ON public.trip_members;
DROP POLICY IF EXISTS "Users can update own membership" ON public.trip_members;
DROP POLICY IF EXISTS "Users can view trip members" ON public.trip_members;
DROP POLICY IF EXISTS "Users can view trip members if they are a member" ON public.trip_members;
DROP POLICY IF EXISTS "Users can update their own member record" ON public.trip_members;

-- Create a single, simple policy that avoids recursion
-- Allow all authenticated users to view trip members (trip-level security handles privacy)
CREATE POLICY "Anyone can view trip members"
  ON public.trip_members FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Allow trip owners to manage members
CREATE POLICY "Owners can manage members"
  ON public.trip_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_members.trip_id
      AND trips.created_by = auth.uid()
    )
  );

-- Allow users to update their own membership
CREATE POLICY "Users update own membership"
  ON public.trip_members FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);