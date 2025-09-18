-- Fix the webhook trigger to only process messages from real users, not AI
-- This prevents infinite loops and duplicate AI responses

-- Drop the existing trigger
DROP TRIGGER IF EXISTS on_chat_message_insert ON trip_chat_messages;

-- Create improved trigger that excludes AI agent messages
CREATE TRIGGER on_chat_message_insert
  AFTER INSERT ON trip_chat_messages
  FOR EACH ROW
  -- Only trigger for non-AI users
  WHEN (NEW.user_id != '00000000-0000-0000-0000-000000000001')
  EXECUTE FUNCTION process_chat_message_webhook();

-- Also add a check to prevent processing messages that are replies to AI suggestions
-- (these are the AI's own chat messages linking to suggestions)
CREATE OR REPLACE FUNCTION process_chat_message_webhook()
RETURNS trigger AS $$
DECLARE
  v_edge_function_url TEXT;
  v_service_role_key TEXT;
  v_response JSONB;
BEGIN
  -- Skip if this is an AI agent message (double check)
  IF NEW.user_id = '00000000-0000-0000-0000-000000000001' THEN
    RETURN NEW;
  END IF;

  -- Skip if this message has AI suggestion metadata
  IF NEW.metadata IS NOT NULL AND NEW.metadata->>'type' = 'ai_suggestion' THEN
    RETURN NEW;
  END IF;

  -- Get the Edge Function URL
  v_edge_function_url := COALESCE(
    current_setting('app.edge_function_url', true),
    'http://host.docker.internal:54321/functions/v1/process-chat-message'
  );

  -- Get the service role key
  v_service_role_key := COALESCE(
    current_setting('app.supabase_service_role_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  -- Make HTTP request to Edge Function
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

  -- Log the webhook call (optional)
  RAISE NOTICE 'Webhook called for message % from user %', NEW.id, NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TRIGGER on_chat_message_insert ON trip_chat_messages IS
'Triggers the process-chat-message Edge Function when a real user sends a message, excluding AI agent messages to prevent loops';