-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create itineraries table
CREATE TABLE IF NOT EXISTS public.itineraries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  document JSONB NOT NULL, -- TipTap document
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_public BOOLEAN DEFAULT false,
  collaborators UUID[] DEFAULT '{}' -- Array of user IDs who can collaborate
);

-- Create places table  
CREATE TABLE IF NOT EXISTS public.places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  location JSONB NOT NULL, -- {lat: number, lng: number}
  address TEXT,
  category TEXT,
  images TEXT[] DEFAULT '{}',
  rating DECIMAL(2,1),
  google_place_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create itinerary_places junction table
CREATE TABLE IF NOT EXISTS public.itinerary_places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  arrival_time TIMESTAMP WITH TIME ZONE,
  departure_time TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(itinerary_id, place_id, order_index)
);

-- Create map_tiles table for storing Protomaps PMTiles
CREATE TABLE IF NOT EXISTS public.map_tiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  bounds JSONB NOT NULL, -- {north, south, east, west}
  zoom_levels JSONB NOT NULL, -- {min: number, max: number}
  file_size BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create realtime collaboration table
CREATE TABLE IF NOT EXISTS public.collaboration_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cursor_position JSONB,
  selection JSONB,
  is_active BOOLEAN DEFAULT true,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Itineraries policies
CREATE POLICY "Public itineraries are viewable by everyone" ON public.itineraries
  FOR SELECT USING (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators));

CREATE POLICY "Users can create itineraries" ON public.itineraries
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own itineraries" ON public.itineraries
  FOR UPDATE USING (auth.uid() = created_by OR auth.uid() = ANY(collaborators));

CREATE POLICY "Users can delete own itineraries" ON public.itineraries
  FOR DELETE USING (auth.uid() = created_by);

-- Places policies (public read, authenticated write)
CREATE POLICY "Places are viewable by everyone" ON public.places
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create places" ON public.places
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update places" ON public.places
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Itinerary_places policies (inherit from itinerary permissions)
CREATE POLICY "Itinerary places viewable with itinerary access" ON public.itinerary_places
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = itinerary_places.itinerary_id 
      AND (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Users can manage places in own itineraries" ON public.itinerary_places
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = itinerary_places.itinerary_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

-- Map tiles policies (public read)
CREATE POLICY "Map tiles are viewable by everyone" ON public.map_tiles
  FOR SELECT USING (true);

-- Collaboration sessions policies
CREATE POLICY "Users can view collaboration sessions for accessible itineraries" ON public.collaboration_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = collaboration_sessions.itinerary_id 
      AND (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Users can manage own collaboration sessions" ON public.collaboration_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Functions and Triggers

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_itineraries_updated_at BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_places_updated_at BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_map_tiles_updated_at BEFORE UPDATE ON public.map_tiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes for better query performance
CREATE INDEX idx_itineraries_created_by ON public.itineraries(created_by);
CREATE INDEX idx_itineraries_is_public ON public.itineraries(is_public);
CREATE INDEX idx_itineraries_collaborators ON public.itineraries USING GIN(collaborators);
CREATE INDEX idx_itinerary_places_itinerary_id ON public.itinerary_places(itinerary_id);
CREATE INDEX idx_itinerary_places_place_id ON public.itinerary_places(place_id);
CREATE INDEX idx_collaboration_sessions_itinerary_id ON public.collaboration_sessions(itinerary_id);
CREATE INDEX idx_collaboration_sessions_user_id ON public.collaboration_sessions(user_id);
CREATE INDEX idx_places_google_place_id ON public.places(google_place_id);