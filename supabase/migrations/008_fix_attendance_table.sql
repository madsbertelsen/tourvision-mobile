-- Fix the user_attendance table by removing invalid foreign key reference
ALTER TABLE public.user_attendance
DROP COLUMN IF EXISTS alternative_id;

-- Add the alternative_id column without the foreign key for now
ALTER TABLE public.user_attendance
ADD COLUMN IF NOT EXISTS alternative_id UUID;