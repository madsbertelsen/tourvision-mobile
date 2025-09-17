-- Add source_message_id to ai_suggestions to track which message triggered the suggestion
ALTER TABLE public.ai_suggestions
ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES public.trip_chat_messages(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_source_message_id ON public.ai_suggestions(source_message_id);

-- Add metadata column to chat messages to store suggestion_id when message is from AI
ALTER TABLE public.trip_chat_messages
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create or update AI Agent user profile
-- First, check if the AI agent user exists, if not create it
DO $$
DECLARE
  v_ai_user_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Insert AI user if it doesn't exist
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role
  )
  VALUES (
    v_ai_user_id,
    'ai-assistant@tourvision.app',
    crypt('AI_AGENT_NOT_FOR_LOGIN', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "system", "providers": ["system"]}',
    '{"full_name": "AI Travel Assistant", "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=ai-assistant"}',
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (id) DO UPDATE
  SET raw_user_meta_data = '{"full_name": "AI Travel Assistant", "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=ai-assistant"}';

  -- Insert or update profile
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    v_ai_user_id,
    'ai-assistant@tourvision.app',
    'AI Travel Assistant',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = 'AI Travel Assistant',
      updated_at = NOW();
END $$;

-- Drop existing policy if it exists and create new one
DROP POLICY IF EXISTS "AI agent can insert messages" ON public.trip_chat_messages;

-- Update RLS policies for AI agent to be able to create messages
CREATE POLICY "AI agent can insert messages" ON public.trip_chat_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = '00000000-0000-0000-0000-000000000001'::uuid
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.trips
        WHERE trips.id = trip_chat_messages.trip_id
        AND (
          trips.is_public = true
          OR trips.created_by = auth.uid()
          OR auth.uid() = ANY(trips.collaborators)
        )
      )
    )
  );

-- Comment on the new columns
COMMENT ON COLUMN public.ai_suggestions.source_message_id IS 'The chat message that triggered this AI suggestion';
COMMENT ON COLUMN public.trip_chat_messages.metadata IS 'Additional metadata for the message, including suggestion_id for AI-generated messages';