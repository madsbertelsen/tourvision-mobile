-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create AI service account user (if not exists)
-- This is a special user that will be used by the Edge Function
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'ai-agent@system.local',
  crypt('AI_AGENT_SERVICE_ACCOUNT', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "AI Assistant", "is_service_account": true}',
  false,
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- Create profile for AI agent
INSERT INTO public.profiles (id, email, full_name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ai-agent@system.local',
  'AI Assistant'
)
ON CONFLICT (id) DO NOTHING;

-- Function to call Edge Function when a message is inserted
CREATE OR REPLACE FUNCTION process_chat_message_webhook()
RETURNS trigger AS $$
DECLARE
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
  v_response JSONB;
BEGIN
  -- Get the Edge Function URL
  -- In production, this would be your actual Supabase project URL
  -- For local development, use host.docker.internal:54321
  v_edge_function_url := COALESCE(
    current_setting('app.edge_function_url', true),
    'http://host.docker.internal:54321/functions/v1/process-chat-message'
  );

  -- Get the service role key (should be set as a configuration)
  -- In production, store this securely
  v_service_role_key := COALESCE(
    current_setting('app.supabase_service_role_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU' -- Default local service role key
  );

  -- Make HTTP request to Edge Function
  -- Note: pg_net runs asynchronously, so we don't wait for the response
  SELECT net.http_post(
    url := v_edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'message_id', NEW.id,
      'trip_id', NEW.trip_id,
      'user_id', NEW.user_id,
      'message', NEW.message
    )
  ) INTO v_response;

  -- Log the webhook call (optional, for debugging)
  RAISE NOTICE 'Webhook called for message %: %', NEW.id, v_response;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call webhook on message insert
DROP TRIGGER IF EXISTS on_chat_message_insert ON trip_chat_messages;
CREATE TRIGGER on_chat_message_insert
  AFTER INSERT ON trip_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION process_chat_message_webhook();

-- Update RLS policies to allow AI agent to create suggestions
-- The AI agent needs to be able to create suggestions
DROP POLICY IF EXISTS "AI can create suggestions" ON public.ai_suggestions;
CREATE POLICY "AI can create suggestions" ON public.ai_suggestions
  FOR INSERT
  WITH CHECK (
    -- Allow AI service account or authenticated users for their trips
    auth.uid() = '00000000-0000-0000-0000-000000000001'
    OR (
      auth.uid() = created_by
      AND EXISTS (
        SELECT 1 FROM public.trips
        WHERE trips.id = ai_suggestions.trip_id
      )
    )
  );

-- Allow AI agent to read trip data
DROP POLICY IF EXISTS "AI can read trips" ON public.trips;
CREATE POLICY "AI can read trips" ON public.trips
  FOR SELECT
  USING (
    -- Allow AI service account to read all trips
    auth.uid() = '00000000-0000-0000-0000-000000000001'
    OR
    -- Or regular access rules
    created_by = auth.uid()
    OR is_public = true
    OR auth.uid() = ANY(collaborators)
  );

-- Allow AI agent to read messages
DROP POLICY IF EXISTS "AI can read messages" ON public.trip_chat_messages;
CREATE POLICY "AI can read messages" ON public.trip_chat_messages
  FOR SELECT
  USING (
    -- Allow AI service account to read all messages
    auth.uid() = '00000000-0000-0000-0000-000000000001'
    OR
    -- Or regular access rules
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

-- Function to configure the webhook URL and service role key
-- Call this function to set up your production values
CREATE OR REPLACE FUNCTION configure_ai_webhook(
  p_edge_function_url TEXT,
  p_service_role_key TEXT
)
RETURNS void AS $$
BEGIN
  -- Store configuration in a settings table or use ALTER SYSTEM
  -- For now, we'll use configuration parameters
  -- Note: This is a simplified approach. In production, use a more secure method

  -- These settings would need to be persisted differently in production
  PERFORM set_config('app.edge_function_url', p_edge_function_url, false);
  PERFORM set_config('app.supabase_service_role_key', p_service_role_key, false);

  RAISE NOTICE 'AI webhook configured with URL: %', p_edge_function_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for documentation
COMMENT ON FUNCTION process_chat_message_webhook() IS
'Webhook function that triggers when a chat message is inserted.
Calls the process-chat-message Edge Function to analyze the message
and potentially create AI suggestions for document changes.';