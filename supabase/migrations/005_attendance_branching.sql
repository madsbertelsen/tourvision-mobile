-- Migration: Add attendance tracking and branching system
-- Description: Support personal attendance choices and group branching when members have different plans

-- Create enum for attendance status
CREATE TYPE attendance_status AS ENUM ('confirmed', 'considering', 'declined', 'alternative');

-- Create enum for member role
CREATE TYPE member_role AS ENUM ('owner', 'member', 'viewer');

-- Table for trip members (beyond just collaborators array)
CREATE TABLE IF NOT EXISTS public.trip_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role member_role DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  invitation_accepted_at TIMESTAMP WITH TIME ZONE,
  invited_by UUID REFERENCES auth.users(id),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  preferences JSONB DEFAULT '{}',  -- Store user-specific preferences for this trip

  -- Ensure unique membership
  CONSTRAINT unique_trip_member UNIQUE(trip_id, user_id)
);

-- Table for tracking attendance at specific destinations/activities
CREATE TABLE IF NOT EXISTS public.user_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL,  -- References the destination ID in the itinerary document
  day_index INTEGER NOT NULL,
  status attendance_status DEFAULT 'considering',
  alternative_id UUID REFERENCES public.itinerary_proposals(id),  -- If they chose an alternative
  notes TEXT,  -- Personal notes about why they're skipping or any preferences
  decided_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one attendance record per user per destination
  CONSTRAINT unique_user_destination UNIQUE(trip_id, user_id, destination_id),
  -- Ensure day_index is valid
  CONSTRAINT valid_day_index CHECK (day_index >= 0)
);

-- Table for parallel activities (when group splits)
CREATE TABLE IF NOT EXISTS public.parallel_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  time_slot_start TIME NOT NULL,
  time_slot_end TIME NOT NULL,
  original_destination_id TEXT NOT NULL,  -- The main activity
  alternative_destination_id TEXT NOT NULL,  -- The alternative happening at same time
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure we don't duplicate parallel activities
  CONSTRAINT unique_parallel UNIQUE(trip_id, day_index, original_destination_id, alternative_destination_id)
);

-- Table for tracking who's doing what during splits
CREATE TABLE IF NOT EXISTS public.split_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parallel_activity_id UUID NOT NULL REFERENCES public.parallel_activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chosen_destination_id TEXT NOT NULL,  -- Which activity they chose during the split

  -- One choice per user per split
  CONSTRAINT unique_split_choice UNIQUE(parallel_activity_id, user_id)
);

-- Invitation tokens for joining trips
CREATE TABLE IF NOT EXISTS public.trip_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  max_uses INTEGER DEFAULT NULL,  -- NULL means unlimited
  uses_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Add index for token lookups
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Indexes for better query performance
CREATE INDEX idx_trip_members_trip_id ON public.trip_members(trip_id);
CREATE INDEX idx_trip_members_user_id ON public.trip_members(user_id);
CREATE INDEX idx_user_attendance_trip_id ON public.user_attendance(trip_id);
CREATE INDEX idx_user_attendance_user_id ON public.user_attendance(user_id);
CREATE INDEX idx_user_attendance_destination_id ON public.user_attendance(destination_id);
CREATE INDEX idx_user_attendance_status ON public.user_attendance(status);
CREATE INDEX idx_parallel_activities_trip_id ON public.parallel_activities(trip_id);
CREATE INDEX idx_trip_invitations_token ON public.trip_invitations(token);
CREATE INDEX idx_trip_invitations_expires_at ON public.trip_invitations(expires_at);

-- Enable RLS
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parallel_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trip_members
CREATE POLICY "Members can view trip membership"
  ON public.trip_members FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = trip_members.trip_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Trip owners can manage members"
  ON public.trip_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE id = trip_id
      AND created_by = auth.uid()
    )
  );

-- RLS Policies for user_attendance
CREATE POLICY "Users can view attendance for their trips"
  ON public.user_attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = user_attendance.trip_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own attendance"
  ON public.user_attendance FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for parallel_activities
CREATE POLICY "Members can view parallel activities"
  ON public.parallel_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = parallel_activities.trip_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create parallel activities"
  ON public.parallel_activities FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = parallel_activities.trip_id
      AND user_id = auth.uid()
    )
  );

-- RLS Policies for split_attendance
CREATE POLICY "Members can view split attendance"
  ON public.split_attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.parallel_activities pa
      JOIN public.trip_members tm ON tm.trip_id = pa.trip_id
      WHERE pa.id = split_attendance.parallel_activity_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their split choices"
  ON public.split_attendance FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for trip_invitations
CREATE POLICY "Trip owners can manage invitations"
  ON public.trip_invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE id = trip_id
      AND created_by = auth.uid()
    )
  );

CREATE POLICY "Anyone can view valid invitations by token"
  ON public.trip_invitations FOR SELECT
  USING (expires_at > NOW());

-- Function to get attendance summary for a destination
CREATE OR REPLACE FUNCTION get_destination_attendance(
  p_trip_id UUID,
  p_destination_id TEXT
)
RETURNS TABLE (
  confirmed_count BIGINT,
  considering_count BIGINT,
  declined_count BIGINT,
  alternative_count BIGINT,
  attendees JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE ua.status = 'confirmed') as confirmed_count,
    COUNT(*) FILTER (WHERE ua.status = 'considering') as considering_count,
    COUNT(*) FILTER (WHERE ua.status = 'declined') as declined_count,
    COUNT(*) FILTER (WHERE ua.status = 'alternative') as alternative_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', ua.user_id,
          'status', ua.status,
          'notes', ua.notes,
          'decided_at', ua.decided_at,
          'profile', jsonb_build_object(
            'id', p.id,
            'username', p.username,
            'avatar_url', p.avatar_url
          )
        ) ORDER BY ua.decided_at
      ) FILTER (WHERE ua.user_id IS NOT NULL),
      '[]'::jsonb
    ) as attendees
  FROM public.user_attendance ua
  LEFT JOIN public.profiles p ON p.id = ua.user_id
  WHERE ua.trip_id = p_trip_id
  AND ua.destination_id = p_destination_id
  GROUP BY ua.trip_id, ua.destination_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle new member onboarding
CREATE OR REPLACE FUNCTION onboard_trip_member(
  p_trip_id UUID,
  p_user_id UUID,
  p_default_status attendance_status DEFAULT 'considering'
)
RETURNS VOID AS $$
DECLARE
  v_destination RECORD;
BEGIN
  -- Mark member as onboarded
  UPDATE public.trip_members
  SET onboarding_completed = TRUE
  WHERE trip_id = p_trip_id AND user_id = p_user_id;

  -- Create attendance records for all existing destinations
  -- Parse the itinerary document to extract all destination IDs
  FOR v_destination IN
    SELECT
      (day->>'dayIndex')::INTEGER as day_index,
      dest->>'id' as destination_id
    FROM public.trips t,
    jsonb_array_elements(t.itinerary_document->'days') day,
    jsonb_array_elements(day->'destinations') dest
    WHERE t.id = p_trip_id
  LOOP
    INSERT INTO public.user_attendance (
      trip_id,
      user_id,
      destination_id,
      day_index,
      status
    ) VALUES (
      p_trip_id,
      p_user_id,
      v_destination.destination_id,
      v_destination.day_index,
      p_default_status
    ) ON CONFLICT (trip_id, user_id, destination_id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept trip invitation
CREATE OR REPLACE FUNCTION accept_trip_invitation(
  p_token TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_trip_id UUID;
  v_invitation RECORD;
BEGIN
  -- Find valid invitation
  SELECT * INTO v_invitation
  FROM public.trip_invitations
  WHERE token = p_token
  AND expires_at > NOW()
  AND (max_uses IS NULL OR uses_count < max_uses);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  v_trip_id := v_invitation.trip_id;

  -- Add user as trip member
  INSERT INTO public.trip_members (
    trip_id,
    user_id,
    role,
    invited_by,
    invitation_accepted_at
  ) VALUES (
    v_trip_id,
    p_user_id,
    'member',
    v_invitation.created_by,
    NOW()
  ) ON CONFLICT (trip_id, user_id)
  DO UPDATE SET invitation_accepted_at = NOW();

  -- Update invitation use count
  UPDATE public.trip_invitations
  SET uses_count = uses_count + 1
  WHERE id = v_invitation.id;

  -- Also add to trips.collaborators array for backward compatibility
  UPDATE public.trips
  SET collaborators = array_append(
    COALESCE(collaborators, ARRAY[]::UUID[]),
    p_user_id
  )
  WHERE id = v_trip_id
  AND NOT (p_user_id = ANY(COALESCE(collaborators, ARRAY[]::UUID[])));

  RETURN v_trip_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get trip branching points
CREATE OR REPLACE FUNCTION get_trip_branches(p_trip_id UUID)
RETURNS TABLE (
  day_index INTEGER,
  time_slot_start TIME,
  time_slot_end TIME,
  branches JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pa.day_index,
    pa.time_slot_start,
    pa.time_slot_end,
    jsonb_agg(
      jsonb_build_object(
        'destination_id',
        CASE
          WHEN idx = 1 THEN pa.original_destination_id
          ELSE pa.alternative_destination_id
        END,
        'attendees', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'user_id', sa.user_id,
              'profile', jsonb_build_object(
                'username', p.username,
                'avatar_url', p.avatar_url
              )
            )
          )
          FROM public.split_attendance sa
          LEFT JOIN public.profiles p ON p.id = sa.user_id
          WHERE sa.parallel_activity_id = pa.id
          AND sa.chosen_destination_id = CASE
            WHEN idx = 1 THEN pa.original_destination_id
            ELSE pa.alternative_destination_id
          END
        )
      )
    ) as branches
  FROM public.parallel_activities pa
  CROSS JOIN generate_series(1, 2) idx
  WHERE pa.trip_id = p_trip_id
  GROUP BY pa.day_index, pa.time_slot_start, pa.time_slot_end
  ORDER BY pa.day_index, pa.time_slot_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;