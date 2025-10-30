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
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;