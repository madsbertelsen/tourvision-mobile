-- Create trip chat messages table
CREATE TABLE IF NOT EXISTS public.trip_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  edited_at TIMESTAMP WITH TIME ZONE,
  is_edited BOOLEAN DEFAULT FALSE,

  -- Optional fields for rich messages
  attachments JSONB
);

-- Add reply_to column if it doesn't exist (for migration compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trip_chat_messages'
    AND column_name = 'reply_to'
  ) THEN
    ALTER TABLE public.trip_chat_messages
    ADD COLUMN reply_to UUID REFERENCES public.trip_chat_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_chat_messages_trip_id ON public.trip_chat_messages(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_chat_messages_created_at ON public.trip_chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.trip_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view messages for trips they have access to
CREATE POLICY "Users can view trip messages" ON public.trip_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_chat_messages.trip_id
      AND (
        trips.created_by = auth.uid()
        OR trips.is_public = true
        OR auth.uid() = ANY(trips.collaborators)
      )
    )
  );

-- Users can insert messages for trips they have access to
CREATE POLICY "Users can send messages" ON public.trip_chat_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.trips
      WHERE trips.id = trip_chat_messages.trip_id
      AND (
        trips.created_by = auth.uid()
        OR auth.uid() = ANY(trips.collaborators)
      )
    )
  );

-- Users can update their own messages
CREATE POLICY "Users can edit own messages" ON public.trip_chat_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages" ON public.trip_chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);