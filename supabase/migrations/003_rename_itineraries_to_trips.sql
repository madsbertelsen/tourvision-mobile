-- Migration: Rename itineraries table to trips and document column to itinerary_document
-- This provides better terminology consistency across the application

-- Step 1: Drop existing RLS policies (we'll recreate them with new names)
DROP POLICY IF EXISTS "Users can view public itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can view their own itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can view itineraries they collaborate on" ON public.itineraries;
DROP POLICY IF EXISTS "Users can create their own itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can update their own itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Collaborators can update itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Users can delete their own itineraries" ON public.itineraries;

DROP POLICY IF EXISTS "Users can view itinerary places for accessible itineraries" ON public.itinerary_places;
DROP POLICY IF EXISTS "Users can manage itinerary places for their itineraries" ON public.itinerary_places;

DROP POLICY IF EXISTS "Users can view collaboration sessions for accessible itineraries" ON public.collaboration_sessions;
DROP POLICY IF EXISTS "Users can create collaboration sessions for their itineraries" ON public.collaboration_sessions;
DROP POLICY IF EXISTS "Users can update their own collaboration sessions" ON public.collaboration_sessions;
DROP POLICY IF EXISTS "Collaborators can manage collaboration sessions" ON public.collaboration_sessions;

-- Step 2: Drop existing indexes
DROP INDEX IF EXISTS idx_itinerary_places_itinerary_id;
DROP INDEX IF EXISTS idx_collaboration_sessions_itinerary_id;

-- Step 3: Rename the main table and its column
ALTER TABLE public.itineraries RENAME TO trips;
ALTER TABLE public.trips RENAME COLUMN document TO itinerary_document;

-- Step 4: Rename the junction table and its column
ALTER TABLE public.itinerary_places RENAME TO trip_places;
ALTER TABLE public.trip_places RENAME COLUMN itinerary_id TO trip_id;

-- Step 5: Rename foreign key column in collaboration_sessions
ALTER TABLE public.collaboration_sessions RENAME COLUMN itinerary_id TO trip_id;

-- Step 6: Recreate indexes with new names
CREATE INDEX IF NOT EXISTS idx_trips_created_by ON public.trips(created_by);
CREATE INDEX IF NOT EXISTS idx_trips_is_public ON public.trips(is_public);
CREATE INDEX IF NOT EXISTS idx_trips_collaborators ON public.trips USING GIN(collaborators);
CREATE INDEX IF NOT EXISTS idx_trip_places_trip_id ON public.trip_places(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_places_place_id ON public.trip_places(place_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_trip_id ON public.collaboration_sessions(trip_id);
-- Note: idx_collaboration_sessions_user_id already exists from previous migration

-- Step 7: Recreate RLS policies with new names for trips table
CREATE POLICY "Users can view public trips"
  ON public.trips FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can view their own trips"
  ON public.trips FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can view trips they collaborate on"
  ON public.trips FOR SELECT
  USING (auth.uid() = ANY(collaborators));

CREATE POLICY "Users can create their own trips"
  ON public.trips FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own trips"
  ON public.trips FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Collaborators can update trips"
  ON public.trips FOR UPDATE
  USING (auth.uid() = ANY(collaborators))
  WITH CHECK (auth.uid() = ANY(collaborators));

CREATE POLICY "Users can delete their own trips"
  ON public.trips FOR DELETE
  USING (auth.uid() = created_by);

-- Step 8: Recreate RLS policies for trip_places table
CREATE POLICY "Users can view trip places for accessible trips"
  ON public.trip_places FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = trip_places.trip_id 
      AND (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Users can manage trip places for their trips"
  ON public.trip_places FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = trip_places.trip_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

-- Step 9: Recreate RLS policies for collaboration_sessions table
CREATE POLICY "Users can view collaboration sessions for accessible trips"
  ON public.collaboration_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = collaboration_sessions.trip_id 
      AND (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Users can create collaboration sessions for their trips"
  ON public.collaboration_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collaboration sessions"
  ON public.collaboration_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Collaborators can manage collaboration sessions"
  ON public.collaboration_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips 
      WHERE id = collaboration_sessions.trip_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

-- Step 10: Update unique constraint on trip_places
ALTER TABLE public.trip_places DROP CONSTRAINT IF EXISTS itinerary_places_itinerary_id_place_id_order_index_key;
ALTER TABLE public.trip_places ADD CONSTRAINT trip_places_trip_id_place_id_order_index_key UNIQUE(trip_id, place_id, order_index);

-- Step 11: Update trigger function if exists
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger for trips table
DROP TRIGGER IF EXISTS handle_itineraries_updated_at ON public.trips;
CREATE TRIGGER handle_trips_updated_at 
  BEFORE UPDATE ON public.trips
  FOR EACH ROW 
  EXECUTE FUNCTION handle_updated_at();

-- Note: Foreign key constraints are automatically updated when we rename columns
-- The trip_activities, trip_chat_messages, and trip_threads tables already use trip_id correctly