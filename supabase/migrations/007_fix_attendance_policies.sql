-- Drop the problematic RLS policies
DROP POLICY IF EXISTS "Users can view attendance for their trips" ON public.user_attendance;
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.user_attendance;

-- Create simpler RLS policies that avoid recursion
CREATE POLICY "Users can view all attendance"
  ON public.user_attendance FOR SELECT
  USING (true);  -- Allow all users to view attendance (simplified for testing)

CREATE POLICY "Users can manage their own attendance"
  ON public.user_attendance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attendance"
  ON public.user_attendance FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own attendance"
  ON public.user_attendance FOR DELETE
  USING (auth.uid() = user_id);