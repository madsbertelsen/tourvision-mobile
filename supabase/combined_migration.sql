-- Complete schema for TourVision Mobile
-- This file combines all migrations into a single comprehensive schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pgsodium";

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create trips table
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    destination TEXT,
    start_date DATE,
    end_date DATE,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'booked', 'ongoing', 'completed', 'cancelled')),
    collaborators UUID[] DEFAULT '{}',
    itinerary_document JSONB DEFAULT '{"type": "doc", "content": [{"type": "paragraph"}]}',
    cover_image TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create trip_members table
CREATE TABLE IF NOT EXISTS public.trip_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
    joined_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(trip_id, user_id)
);

-- Create places table
CREATE TABLE IF NOT EXISTS public.places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT,
    city TEXT,
    country TEXT,
    category TEXT,
    google_place_id TEXT,
    mapbox_place_id TEXT,
    photos TEXT[],
    ratings JSONB,
    opening_hours JSONB,
    price_level INTEGER CHECK (price_level >= 0 AND price_level <= 4),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create trip_places table
CREATE TABLE IF NOT EXISTS public.trip_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    place_id UUID REFERENCES public.places(id) ON DELETE CASCADE,
    day_number INTEGER,
    order_in_day INTEGER,
    duration_minutes INTEGER,
    notes TEXT,
    booking_status TEXT DEFAULT 'not_needed' CHECK (booking_status IN ('not_needed', 'pending', 'confirmed', 'cancelled')),
    booking_reference TEXT,
    cost_estimate JSONB,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(trip_id, place_id)
);

-- Create trip_invitations table
CREATE TABLE IF NOT EXISTS public.trip_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    token UUID DEFAULT gen_random_uuid(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    accepted_at TIMESTAMPTZ,
    UNIQUE(trip_id, email)
);

-- Create collaboration_sessions table
CREATE TABLE IF NOT EXISTS public.collaboration_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    awareness_state JSONB,
    cursor_position JSONB,
    selection_state JSONB,
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(trip_id, user_id)
);

-- Create map_tiles table for PMTiles storage
CREATE TABLE IF NOT EXISTS public.map_tiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    bounds JSONB NOT NULL,
    zoom_levels INT4RANGE NOT NULL,
    tile_data BYTEA NOT NULL,
    format TEXT DEFAULT 'pmtiles' CHECK (format IN ('pmtiles', 'mbtiles')),
    size_bytes BIGINT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    place_id UUID REFERENCES public.places(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_type TEXT NOT NULL CHECK (booking_type IN ('accommodation', 'transport', 'activity', 'restaurant', 'other')),
    provider TEXT,
    reference_number TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    check_in_date TIMESTAMPTZ,
    check_out_date TIMESTAMPTZ,
    total_cost DECIMAL(10, 2),
    currency TEXT DEFAULT 'USD',
    confirmation_url TEXT,
    cancellation_policy TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    date DATE NOT NULL,
    split_between UUID[],
    receipt_url TEXT,
    is_reimbursable BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create trip_chat_messages table
CREATE TABLE IF NOT EXISTS public.trip_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create proposals table for collaborative planning
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    source_message_id UUID REFERENCES public.trip_chat_messages(id) ON DELETE SET NULL,
    proposal_type TEXT NOT NULL CHECK (proposal_type IN ('add', 'modify', 'remove', 'reorganize')),
    title TEXT NOT NULL,
    description TEXT,
    current_content JSONB,
    proposed_content JSONB NOT NULL,
    chat_context TEXT[],
    ai_reasoning TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    votes JSONB DEFAULT '{}',
    required_approvals INTEGER DEFAULT 1,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES auth.users(id),
    rejection_reason TEXT,
    enriched_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create ai_suggestions table
CREATE TABLE IF NOT EXISTS public.ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL,
    content JSONB NOT NULL,
    reasoning TEXT,
    confidence_score DECIMAL(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    votes_for INTEGER DEFAULT 0,
    votes_against INTEGER DEFAULT 0,
    voter_ids UUID[] DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Create ai_agent_config table
CREATE TABLE IF NOT EXISTS public.ai_agent_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    personality TEXT DEFAULT 'helpful' CHECK (personality IN ('helpful', 'professional', 'casual', 'adventurous')),
    auto_suggest BOOLEAN DEFAULT true,
    suggestion_threshold DECIMAL(3, 2) DEFAULT 0.7,
    response_style TEXT DEFAULT 'concise' CHECK (response_style IN ('concise', 'detailed', 'balanced')),
    language TEXT DEFAULT 'en',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(trip_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trips_created_by ON public.trips(created_by);
CREATE INDEX IF NOT EXISTS idx_trips_is_public ON public.trips(is_public);
CREATE INDEX IF NOT EXISTS idx_trip_members_user_id ON public.trip_members(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip_id ON public.trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_trip_id ON public.trip_places(trip_id);
-- Note: location column removed from places table in current schema
-- Note: collaboration_sessions table structure different in current schema
CREATE INDEX IF NOT EXISTS idx_trip_chat_messages_trip_id ON public.trip_chat_messages(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_chat_messages_created_at ON public.trip_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_trip_id ON public.proposals(trip_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.proposals(status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_trip_id ON public.ai_suggestions(trip_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON public.ai_suggestions(status);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh (from migration 003)
DROP POLICY IF EXISTS "Users can view public trips" ON public.trips;
DROP POLICY IF EXISTS "Trip members can view their trips" ON public.trips;
DROP POLICY IF EXISTS "Users can create their own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can update their own trips" ON public.trips;
DROP POLICY IF EXISTS "Users can delete their own trips" ON public.trips;
DROP POLICY IF EXISTS "Members can view trip members" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can add members" ON public.trip_members;
DROP POLICY IF EXISTS "Trip owners can remove members" ON public.trip_members;
DROP POLICY IF EXISTS "Members can leave trips" ON public.trip_members;

-- Create RLS policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT TO public
    USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE TO public
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT TO public
    WITH CHECK (auth.uid() = id);

-- Create simplified RLS policies for trips (from migration 003)
CREATE POLICY "trips_select_policy" ON public.trips
    FOR SELECT TO public
    USING (
        is_public = true
        OR created_by = auth.uid()
        OR auth.uid() = ANY(collaborators)
    );

CREATE POLICY "trips_insert_policy" ON public.trips
    FOR INSERT TO public
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "trips_update_policy" ON public.trips
    FOR UPDATE TO public
    USING (auth.uid() = created_by OR auth.uid() = ANY(collaborators));

CREATE POLICY "trips_delete_policy" ON public.trips
    FOR DELETE TO public
    USING (auth.uid() = created_by);

-- Create simplified RLS policies for trip_members (from migration 003)
CREATE POLICY "trip_members_select_policy" ON public.trip_members
    FOR SELECT TO public
    USING (user_id = auth.uid());

CREATE POLICY "trip_members_insert_policy" ON public.trip_members
    FOR INSERT TO public
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_members.trip_id
            AND trips.created_by = auth.uid()
        )
    );

CREATE POLICY "trip_members_delete_policy" ON public.trip_members
    FOR DELETE TO public
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_members.trip_id
            AND trips.created_by = auth.uid()
        )
    );

-- Create RLS policies for places
CREATE POLICY "Users can view all places" ON public.places
    FOR SELECT TO public
    USING (true);

CREATE POLICY "Authenticated users can create places" ON public.places
    FOR INSERT TO public
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update places they have access to" ON public.places
    FOR UPDATE TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trip_places tp
            JOIN public.trips t ON t.id = tp.trip_id
            WHERE tp.place_id = places.id
            AND (t.created_by = auth.uid() OR auth.uid() = ANY(t.collaborators))
        )
    );

-- Create RLS policies for trip_places
CREATE POLICY "Users can view trip places for their trips" ON public.trip_places
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_places.trip_id
            AND (
                trips.is_public = true
                OR trips.created_by = auth.uid()
                OR auth.uid() = ANY(trips.collaborators)
            )
        )
    );

CREATE POLICY "Users can manage trip places for their trips" ON public.trip_places
    FOR ALL TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_places.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

-- Create RLS policies for trip_invitations
CREATE POLICY "Users can view invitations they sent or received" ON public.trip_invitations
    FOR SELECT TO public
    USING (
        invited_by = auth.uid()
        OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

CREATE POLICY "Trip owners can create invitations" ON public.trip_invitations
    FOR INSERT TO public
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_invitations.trip_id
            AND trips.created_by = auth.uid()
        )
    );

CREATE POLICY "Users can update invitations they received" ON public.trip_invitations
    FOR UPDATE TO public
    USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Create RLS policies for collaboration_sessions
CREATE POLICY "Users can manage their own sessions" ON public.collaboration_sessions
    FOR ALL TO public
    USING (user_id = auth.uid());

CREATE POLICY "Users can view sessions for their trips" ON public.collaboration_sessions
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = collaboration_sessions.trip_id
            AND (
                trips.created_by = auth.uid()
                OR auth.uid() = ANY(trips.collaborators)
            )
        )
    );

-- Create RLS policies for map_tiles
CREATE POLICY "Users can view map tiles for their trips" ON public.map_tiles
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = map_tiles.trip_id
            AND (
                trips.is_public = true
                OR trips.created_by = auth.uid()
                OR auth.uid() = ANY(trips.collaborators)
            )
        )
    );

CREATE POLICY "Users can manage map tiles for their trips" ON public.map_tiles
    FOR ALL TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = map_tiles.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

-- Create RLS policies for bookings
CREATE POLICY "Users can view bookings for their trips" ON public.bookings
    FOR SELECT TO public
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = bookings.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

CREATE POLICY "Users can manage their own bookings" ON public.bookings
    FOR ALL TO public
    USING (user_id = auth.uid());

-- Create RLS policies for expenses
CREATE POLICY "Users can view expenses for their trips" ON public.expenses
    FOR SELECT TO public
    USING (
        user_id = auth.uid()
        OR auth.uid() = ANY(split_between)
        OR EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = expenses.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

CREATE POLICY "Users can manage their own expenses" ON public.expenses
    FOR ALL TO public
    USING (user_id = auth.uid());

-- Create RLS policies for trip_chat_messages
CREATE POLICY "Users can view messages for their trips" ON public.trip_chat_messages
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_chat_messages.trip_id
            AND (
                trips.created_by = auth.uid()
                OR auth.uid() = ANY(trips.collaborators)
            )
        )
    );

CREATE POLICY "Users can send messages to their trips" ON public.trip_chat_messages
    FOR INSERT TO public
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = trip_chat_messages.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

-- Create RLS policies for proposals
CREATE POLICY "Users can view proposals for their trips" ON public.proposals
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = proposals.trip_id
            AND (
                trips.created_by = auth.uid()
                OR auth.uid() = ANY(trips.collaborators)
            )
        )
    );

CREATE POLICY "Users can create proposals for their trips" ON public.proposals
    FOR INSERT TO public
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = proposals.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

CREATE POLICY "Users can update proposals for their trips" ON public.proposals
    FOR UPDATE TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = proposals.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

-- Create RLS policies for ai_suggestions
CREATE POLICY "Users can view AI suggestions for their trips" ON public.ai_suggestions
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = ai_suggestions.trip_id
            AND (
                trips.created_by = auth.uid()
                OR auth.uid() = ANY(trips.collaborators)
            )
        )
    );

CREATE POLICY "AI can create suggestions" ON public.ai_suggestions
    FOR INSERT TO public
    WITH CHECK (true);

CREATE POLICY "Users can update suggestions for their trips" ON public.ai_suggestions
    FOR UPDATE TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = ai_suggestions.trip_id
            AND (trips.created_by = auth.uid() OR auth.uid() = ANY(trips.collaborators))
        )
    );

-- Create RLS policies for ai_agent_config
CREATE POLICY "Users can view AI config for their trips" ON public.ai_agent_config
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = ai_agent_config.trip_id
            AND (
                trips.created_by = auth.uid()
                OR auth.uid() = ANY(trips.collaborators)
            )
        )
    );

CREATE POLICY "Trip owners can manage AI config" ON public.ai_agent_config
    FOR ALL TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.trips
            WHERE trips.id = ai_agent_config.trip_id
            AND trips.created_by = auth.uid()
        )
    );

-- Create functions for triggers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_trips_updated_at
    BEFORE UPDATE ON public.trips
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_places_updated_at
    BEFORE UPDATE ON public.places
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_trip_places_updated_at
    BEFORE UPDATE ON public.trip_places
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_trip_chat_messages_updated_at
    BEFORE UPDATE ON public.trip_chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_proposals_updated_at
    BEFORE UPDATE ON public.proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_ai_suggestions_updated_at
    BEFORE UPDATE ON public.ai_suggestions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_ai_agent_config_updated_at
    BEFORE UPDATE ON public.ai_agent_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER update_map_tiles_updated_at
    BEFORE UPDATE ON public.map_tiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- Create AI system user for chat responses (from migration 20250918083556)
-- This user is used by the Edge Functions to create AI-generated messages and proposals

-- First, insert into auth.users
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token,
    instance_id
)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'ai@tourvision.system',
    '', -- No password since this is a system user
    NOW(),
    '{"provider": "system", "providers": ["system"]}',
    '{"sub": "00000000-0000-0000-0000-000000000001", "email": "ai@tourvision.system", "email_verified": true, "is_system_user": true}',
    'authenticated',
    'authenticated',
    NOW(),
    NOW(),
    '',
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- Create profile for AI user
INSERT INTO public.profiles (
    id,
    username,
    full_name,
    avatar_url
)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'ai_assistant',
    'AI Travel Assistant',
    'https://api.dicebear.com/7.x/bottts/svg?seed=ai-assistant&backgroundColor=6366F1'
)
ON CONFLICT (id) DO UPDATE
SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;

-- Create webhook function to process chat messages
CREATE OR REPLACE FUNCTION public.process_chat_message_webhook()
RETURNS TRIGGER AS $$
DECLARE
    edge_function_url TEXT;
    service_role_key TEXT;
BEGIN
    -- Get the Edge Function URL and service role key
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/process-chat-message';
    service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

    -- Call the Edge Function using pg_net
    PERFORM net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
            'message_id', NEW.id,
            'trip_id', NEW.trip_id,
            'user_id', NEW.user_id,
            'message', NEW.message
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to process chat messages
CREATE OR REPLACE TRIGGER on_chat_message_created
    AFTER INSERT ON public.trip_chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.process_chat_message_webhook();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;-- Add columns for diff-based proposals
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS proposal_operations JSONB,
ADD COLUMN IF NOT EXISTS diff_decorations JSONB;

-- Add comment explaining the new columns
COMMENT ON COLUMN proposals.proposal_operations IS 'ProseMirror operations/steps to transform current_content to proposed_content';
COMMENT ON COLUMN proposals.diff_decorations IS 'Decoration positions for visualizing diffs in the editor';

-- Make proposed_content optional since we'll use operations instead
ALTER TABLE proposals
ALTER COLUMN proposed_content DROP NOT NULL;

-- Add index on proposal_operations for faster queries
CREATE INDEX IF NOT EXISTS idx_proposals_operations ON proposals USING gin (proposal_operations);-- Create proposal_votes table
CREATE TABLE IF NOT EXISTS proposal_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('approve', 'reject')),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure a user can only vote once per proposal
    UNIQUE(proposal_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal_id ON proposal_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_user_id ON proposal_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_created_at ON proposal_votes(created_at DESC);

-- Enable RLS
ALTER TABLE proposal_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view votes on proposals they can see" ON proposal_votes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM proposals p
            JOIN trips t ON p.trip_id = t.id
            WHERE p.id = proposal_votes.proposal_id
            AND (t.created_by = auth.uid() OR t.is_public = true)
        )
    );

CREATE POLICY "Users can create votes on proposals they can access" ON proposal_votes
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM proposals p
            JOIN trips t ON p.trip_id = t.id
            WHERE p.id = proposal_votes.proposal_id
            AND (t.created_by = auth.uid() OR t.is_public = true)
        )
    );

CREATE POLICY "Users can update their own votes" ON proposal_votes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON proposal_votes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Function to update proposal counts when votes change
CREATE OR REPLACE FUNCTION update_proposal_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update approval and rejection counts
        UPDATE proposals
        SET
            approval_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = NEW.proposal_id AND vote_type = 'approve'
            ),
            rejection_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = NEW.proposal_id AND vote_type = 'reject'
            ),
            updated_at = NOW()
        WHERE id = NEW.proposal_id;

        -- Check if proposal should be auto-approved
        UPDATE proposals
        SET
            status = 'approved',
            approved_at = NOW()
        WHERE id = NEW.proposal_id
            AND status = 'pending'
            AND approval_count >= required_approvals;

    ELSIF TG_OP = 'DELETE' THEN
        -- Update counts after deletion
        UPDATE proposals
        SET
            approval_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = OLD.proposal_id AND vote_type = 'approve'
            ),
            rejection_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = OLD.proposal_id AND vote_type = 'reject'
            ),
            updated_at = NOW()
        WHERE id = OLD.proposal_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for vote count updates
CREATE TRIGGER update_proposal_counts_on_vote
AFTER INSERT OR UPDATE OR DELETE ON proposal_votes
FOR EACH ROW
EXECUTE FUNCTION update_proposal_vote_counts();-- Add columns for ProseMirror transaction persistence
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS transaction_steps JSONB,
ADD COLUMN IF NOT EXISTS operation_metadata JSONB,
ADD COLUMN IF NOT EXISTS ai_confidence FLOAT CHECK (ai_confidence >= 0 AND ai_confidence <= 1);

-- Add columns to ai_suggestions table for transaction data
ALTER TABLE ai_suggestions
ADD COLUMN IF NOT EXISTS transaction_steps JSONB,
ADD COLUMN IF NOT EXISTS operation_metadata JSONB,
ADD COLUMN IF NOT EXISTS affected_range JSONB,
ADD COLUMN IF NOT EXISTS ai_confidence FLOAT CHECK (ai_confidence >= 0 AND ai_confidence <= 1);

-- Create a new table for tracking AI-generated operations history
CREATE TABLE IF NOT EXISTS ai_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Original state
    original_document JSONB NOT NULL,
    user_prompt TEXT NOT NULL,

    -- AI processing metadata
    ai_model TEXT,
    ai_confidence FLOAT CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    ai_reasoning TEXT,
    processing_time_ms INTEGER,

    -- ProseMirror transaction data
    transaction_steps JSONB NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('insert_after', 'insert_before', 'replace', 'delete', 'append')),
    target_position INTEGER,
    html_reference TEXT,

    -- Result
    modified_document JSONB NOT NULL,
    affected_range JSONB,
    diff_decorations JSONB,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'reverted')),
    applied_at TIMESTAMP WITH TIME ZONE,
    reverted_at TIMESTAMP WITH TIME ZONE,

    -- Rollback data
    inverse_steps JSONB,
    checkpoint_state JSONB
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_operations_trip_id ON ai_operations(trip_id);
CREATE INDEX IF NOT EXISTS idx_ai_operations_user_id ON ai_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_operations_created_at ON ai_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_operations_status ON ai_operations(status);
CREATE INDEX IF NOT EXISTS idx_proposals_transaction_steps ON proposals USING gin (transaction_steps);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_transaction_steps ON ai_suggestions USING gin (transaction_steps);

-- Add comments explaining the new columns
COMMENT ON COLUMN proposals.transaction_steps IS 'ProseMirror transaction steps for precise document transformation';
COMMENT ON COLUMN proposals.operation_metadata IS 'Additional metadata about the operation (user prompt, AI reasoning, etc)';
COMMENT ON COLUMN proposals.ai_confidence IS 'AI confidence score for the suggested change (0-1)';

COMMENT ON COLUMN ai_suggestions.transaction_steps IS 'ProseMirror transaction steps for the AI suggestion';
COMMENT ON COLUMN ai_suggestions.operation_metadata IS 'Metadata about how the AI generated this suggestion';
COMMENT ON COLUMN ai_suggestions.affected_range IS 'The document range affected by this suggestion {from: pos, to: pos}';
COMMENT ON COLUMN ai_suggestions.ai_confidence IS 'AI confidence score for this suggestion (0-1)';

COMMENT ON TABLE ai_operations IS 'Complete history of AI-generated document operations with full transaction data for rollback and auditing';

-- Add RLS policies for the new table
ALTER TABLE ai_operations ENABLE ROW LEVEL SECURITY;

-- Users can view AI operations for trips they have access to
CREATE POLICY "Users can view AI operations for accessible trips"
    ON ai_operations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM trips t
            WHERE t.id = ai_operations.trip_id
            AND (
                t.created_by = auth.uid()
                OR t.is_public = true
            )
        )
    );

-- Users can create AI operations for trips they can edit
CREATE POLICY "Users can create AI operations for editable trips"
    ON ai_operations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trips t
            WHERE t.id = ai_operations.trip_id
            AND t.created_by = auth.uid()
        )
    );

-- Users can update AI operations they created
CREATE POLICY "Users can update their own AI operations"
    ON ai_operations FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());-- Add missing approval_count and rejection_count columns to proposals table
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS approval_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0;

-- Update existing proposals with current counts
UPDATE proposals p
SET
    approval_count = COALESCE((
        SELECT COUNT(*) FROM proposal_votes
        WHERE proposal_id = p.id AND vote_type = 'approve'
    ), 0),
    rejection_count = COALESCE((
        SELECT COUNT(*) FROM proposal_votes
        WHERE proposal_id = p.id AND vote_type = 'reject'
    ), 0);

-- Add column for applied_at if missing
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone;-- Trip sharing system
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
$$ LANGUAGE plpgsql SECURITY DEFINER;-- Add Y.js support to trips table
-- This migration adds columns for storing Y.js CRDT state and removes the old itinerary_document

-- Add Y.js state columns
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS yjs_state BYTEA,
ADD COLUMN IF NOT EXISTS yjs_clock BIGINT DEFAULT 0;

-- Drop old itinerary_document column (no backward compatibility needed)
ALTER TABLE public.trips
DROP COLUMN IF EXISTS itinerary_document;

-- Create table for incremental Y.js updates
-- This allows efficient sync for clients that are slightly out of date
CREATE TABLE IF NOT EXISTS public.yjs_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  update_data BYTEA NOT NULL,
  clock INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Index for efficient querying by trip and clock
CREATE INDEX IF NOT EXISTS idx_yjs_updates_trip_clock
ON public.yjs_updates(trip_id, clock);

-- Enable RLS on yjs_updates table
ALTER TABLE public.yjs_updates ENABLE ROW LEVEL SECURITY;

-- Allow users to read yjs_updates for trips they have access to
CREATE POLICY "Users can read yjs_updates for accessible trips"
ON public.yjs_updates FOR SELECT
USING (
  trip_id IN (
    SELECT id FROM public.trips
    WHERE created_by = auth.uid()
    OR auth.uid() = ANY(collaborators)
    OR is_public = true
  )
);

-- Allow users to insert yjs_updates for trips they have access to
CREATE POLICY "Users can insert yjs_updates for accessible trips"
ON public.yjs_updates FOR INSERT
WITH CHECK (
  trip_id IN (
    SELECT id FROM public.trips
    WHERE created_by = auth.uid()
    OR auth.uid() = ANY(collaborators)
  )
);

-- Add comment explaining the schema
COMMENT ON COLUMN public.trips.yjs_state IS 'Y.js CRDT state as binary data (BYTEA)';
COMMENT ON COLUMN public.trips.yjs_clock IS 'Y.js logical clock for versioning';
COMMENT ON TABLE public.yjs_updates IS 'Incremental Y.js updates for efficient sync';
