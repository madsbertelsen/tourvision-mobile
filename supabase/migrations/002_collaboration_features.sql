-- Migration: Add collaboration features tables
-- Description: Adds tables for comments, chat, threads, and notifications

-- Create enum for activity types
CREATE TYPE activity_type AS ENUM ('comment', 'suggestion', 'change');

-- Create trip_activities table for comments, suggestions, and changes
CREATE TABLE IF NOT EXISTS public.trip_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  content TEXT NOT NULL,
  location_context TEXT, -- e.g., "Louvre Museum", "Day 2", "Le Comptoir du Relais"
  metadata JSONB DEFAULT '{}', -- Additional data like old/new values for changes
  parent_id UUID REFERENCES public.trip_activities(id) ON DELETE CASCADE, -- For replies
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trip_chat_messages table for real-time chat
CREATE TABLE IF NOT EXISTS public.trip_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]', -- Array of attachment objects
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trip_threads table for discussion threads
CREATE TABLE IF NOT EXISTS public.trip_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create thread_messages table for messages within threads
CREATE TABLE IF NOT EXISTS public.thread_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES public.trip_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create activity_notifications table for tracking unread items
CREATE TABLE IF NOT EXISTS public.activity_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.trip_activities(id) ON DELETE CASCADE,
  chat_message_id UUID REFERENCES public.trip_chat_messages(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.trip_threads(id) ON DELETE CASCADE,
  thread_message_id UUID REFERENCES public.thread_messages(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure at least one reference is provided
  CONSTRAINT at_least_one_reference CHECK (
    activity_id IS NOT NULL OR 
    chat_message_id IS NOT NULL OR 
    thread_id IS NOT NULL OR 
    thread_message_id IS NOT NULL
  )
);

-- Create reactions table for emoji reactions
CREATE TABLE IF NOT EXISTS public.activity_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.trip_activities(id) ON DELETE CASCADE,
  chat_message_id UUID REFERENCES public.trip_chat_messages(id) ON DELETE CASCADE,
  thread_message_id UUID REFERENCES public.thread_messages(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure exactly one reference is provided
  CONSTRAINT exactly_one_reference CHECK (
    (activity_id IS NOT NULL)::int + 
    (chat_message_id IS NOT NULL)::int + 
    (thread_message_id IS NOT NULL)::int = 1
  ),
  -- Unique constraint to prevent duplicate reactions
  UNIQUE(user_id, activity_id, emoji),
  UNIQUE(user_id, chat_message_id, emoji),
  UNIQUE(user_id, thread_message_id, emoji)
);

-- Enable Row Level Security
ALTER TABLE public.trip_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trip_activities
CREATE POLICY "View activities for accessible trips" ON public.trip_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = trip_activities.trip_id 
      AND (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Create activities for accessible trips" ON public.trip_activities
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = trip_activities.trip_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Update own activities" ON public.trip_activities
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Delete own activities" ON public.trip_activities
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for trip_chat_messages
CREATE POLICY "View chat for accessible trips" ON public.trip_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = trip_chat_messages.trip_id 
      AND (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Send chat in accessible trips" ON public.trip_chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = trip_chat_messages.trip_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Edit own messages" ON public.trip_chat_messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Delete own messages" ON public.trip_chat_messages
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for trip_threads
CREATE POLICY "View threads for accessible trips" ON public.trip_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = trip_threads.trip_id 
      AND (is_public = true OR auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Create threads in accessible trips" ON public.trip_threads
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.itineraries 
      WHERE id = trip_threads.trip_id 
      AND (auth.uid() = created_by OR auth.uid() = ANY(collaborators))
    )
  );

CREATE POLICY "Update own threads" ON public.trip_threads
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Delete own threads" ON public.trip_threads
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for thread_messages
CREATE POLICY "View thread messages for accessible threads" ON public.thread_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trip_threads t
      JOIN public.itineraries i ON t.trip_id = i.id
      WHERE t.id = thread_messages.thread_id 
      AND (i.is_public = true OR auth.uid() = i.created_by OR auth.uid() = ANY(i.collaborators))
    )
  );

CREATE POLICY "Post in accessible threads" ON public.thread_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.trip_threads t
      JOIN public.itineraries i ON t.trip_id = i.id
      WHERE t.id = thread_messages.thread_id 
      AND (auth.uid() = i.created_by OR auth.uid() = ANY(i.collaborators))
    )
  );

CREATE POLICY "Edit own thread messages" ON public.thread_messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Delete own thread messages" ON public.thread_messages
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for notifications
CREATE POLICY "View own notifications" ON public.activity_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Create notifications for others" ON public.activity_notifications
  FOR INSERT WITH CHECK (auth.uid() != user_id);

CREATE POLICY "Update own notifications" ON public.activity_notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Delete own notifications" ON public.activity_notifications
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for reactions
CREATE POLICY "View reactions on accessible content" ON public.activity_reactions
  FOR SELECT USING (true); -- Reactions are public within accessible content

CREATE POLICY "Add own reactions" ON public.activity_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Remove own reactions" ON public.activity_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_trip_activities_trip_id ON public.trip_activities(trip_id);
CREATE INDEX idx_trip_activities_user_id ON public.trip_activities(user_id);
CREATE INDEX idx_trip_activities_type ON public.trip_activities(type);
CREATE INDEX idx_trip_activities_parent_id ON public.trip_activities(parent_id);
CREATE INDEX idx_trip_activities_created_at ON public.trip_activities(created_at DESC);

CREATE INDEX idx_trip_chat_messages_trip_id ON public.trip_chat_messages(trip_id);
CREATE INDEX idx_trip_chat_messages_user_id ON public.trip_chat_messages(user_id);
CREATE INDEX idx_trip_chat_messages_created_at ON public.trip_chat_messages(created_at DESC);

CREATE INDEX idx_trip_threads_trip_id ON public.trip_threads(trip_id);
CREATE INDEX idx_trip_threads_user_id ON public.trip_threads(user_id);
CREATE INDEX idx_trip_threads_status ON public.trip_threads(status);

CREATE INDEX idx_thread_messages_thread_id ON public.thread_messages(thread_id);
CREATE INDEX idx_thread_messages_user_id ON public.thread_messages(user_id);
CREATE INDEX idx_thread_messages_created_at ON public.thread_messages(created_at DESC);

CREATE INDEX idx_activity_notifications_user_id ON public.activity_notifications(user_id);
CREATE INDEX idx_activity_notifications_trip_id ON public.activity_notifications(trip_id);
CREATE INDEX idx_activity_notifications_is_read ON public.activity_notifications(is_read);

CREATE INDEX idx_activity_reactions_activity_id ON public.activity_reactions(activity_id);
CREATE INDEX idx_activity_reactions_chat_message_id ON public.activity_reactions(chat_message_id);
CREATE INDEX idx_activity_reactions_thread_message_id ON public.activity_reactions(thread_message_id);
CREATE INDEX idx_activity_reactions_user_id ON public.activity_reactions(user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_trip_activities_updated_at BEFORE UPDATE ON public.trip_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trip_threads_updated_at BEFORE UPDATE ON public.trip_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create notification when activity is created
CREATE OR REPLACE FUNCTION public.create_activity_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Create notifications for all collaborators except the author
  INSERT INTO public.activity_notifications (user_id, trip_id, activity_id)
  SELECT 
    unnest(i.collaborators) as user_id,
    NEW.trip_id,
    NEW.id
  FROM public.itineraries i
  WHERE i.id = NEW.trip_id
    AND unnest(i.collaborators) != NEW.user_id;
  
  -- Also notify the trip creator if they're not the author
  INSERT INTO public.activity_notifications (user_id, trip_id, activity_id)
  SELECT 
    i.created_by,
    NEW.trip_id,
    NEW.id
  FROM public.itineraries i
  WHERE i.id = NEW.trip_id
    AND i.created_by != NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_notifications
      WHERE user_id = i.created_by 
        AND trip_id = NEW.trip_id 
        AND activity_id = NEW.id
    );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic notifications
CREATE TRIGGER create_activity_notification_trigger
  AFTER INSERT ON public.trip_activities
  FOR EACH ROW EXECUTE FUNCTION public.create_activity_notification();

-- Similar triggers can be added for chat messages and threads

-- Function to get unread notification counts
CREATE OR REPLACE FUNCTION public.get_unread_counts(p_trip_id UUID)
RETURNS TABLE(
  total_unread BIGINT,
  unread_comments BIGINT,
  unread_suggestions BIGINT,
  unread_changes BIGINT,
  unread_chat BIGINT,
  unread_threads BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE NOT is_read) as total_unread,
    COUNT(*) FILTER (WHERE NOT is_read AND ta.type = 'comment') as unread_comments,
    COUNT(*) FILTER (WHERE NOT is_read AND ta.type = 'suggestion') as unread_suggestions,
    COUNT(*) FILTER (WHERE NOT is_read AND ta.type = 'change') as unread_changes,
    COUNT(*) FILTER (WHERE NOT is_read AND chat_message_id IS NOT NULL) as unread_chat,
    COUNT(*) FILTER (WHERE NOT is_read AND (thread_id IS NOT NULL OR thread_message_id IS NOT NULL)) as unread_threads
  FROM public.activity_notifications n
  LEFT JOIN public.trip_activities ta ON n.activity_id = ta.id
  WHERE n.user_id = auth.uid() 
    AND n.trip_id = p_trip_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for collaboration tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.thread_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_reactions;