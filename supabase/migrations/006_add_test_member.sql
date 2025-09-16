-- Add test user as member of Barcelona trip for testing
-- Only insert if the user exists
DO $$
BEGIN
  -- Check if user exists before inserting
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'test@example.com') THEN
    INSERT INTO public.trip_members (trip_id, user_id, role, joined_at, onboarding_completed)
    SELECT
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890', -- Barcelona Adventure trip
      id,
      'owner',
      NOW(),
      true
    FROM auth.users
    WHERE email = 'test@example.com'
    ON CONFLICT (trip_id, user_id) DO NOTHING;
  END IF;
END $$;